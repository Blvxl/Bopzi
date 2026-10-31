import { collections, items, type LayerSettings } from './editing';
import { CAPTION_PRESETS, clipLength, newTitle, positions, splitClip, uid, validateTimeline, type MediaInfo, type Timeline } from './model';
import { attachLayer, freezeAt, reconcileAttachments, replayClip } from './workflow';

/**
 * What the video AI changes, as small steps instead of a whole new timeline: add this, change that field, cut this
 * range out. Each step names the exact thing it touches, so nothing else can drift, a broken step is dropped on its own
 * with a reason, and the user can switch single steps off in the review. Pure: the server applies the AI's steps to
 * check them, and the editor applies the same steps again whenever the user switches one off or on.
 */
export type Operation =
  | { op: 'add'; kind: 'clips' | 'titles' | 'effects' | 'overlays' | 'videoOverlays' | 'audio'; item: Record<string, unknown>; index?: number }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'remove'; id: string }
  /** Removes the footage between two timeline seconds and closes the gap; what came later moves up. */
  | { op: 'cutRange'; start: number; end: number }
  | { op: 'moveClip'; id: string; index: number }
  | { op: 'freeze'; clipId: string; at: number; seconds?: number }
  | { op: 'replay'; clipId: string }
  /** A layer's name, visibility and keyframed motion, and which clip it rides on. */
  | { op: 'layer'; id: string; name?: string; hidden?: boolean; keyframes?: unknown[] | null; attachTo?: string | null }
  | { op: 'project'; patch: { name?: string; format?: Timeline['format']; captionStyle?: Partial<Timeline['captionStyle']>; duck?: boolean } };
/** `why`: the AI's own short note for this step, shown in the review. */
export type Step = Operation & { why?: string };
export type StepResult = { label: string; error?: string };

const ADDABLE = ['clips', 'titles', 'effects', 'overlays', 'videoOverlays', 'audio'] as const;
const kindOf = (t: Timeline, id: string) => collections.find(kind => t[kind].some(i => i.id === id));
const clean = (v: unknown) => typeof v === 'string' ? v.slice(0, 80) : '';

/** A short description of a step for the review list, written from the timeline it applies to. */
export function describe(t: Timeline, s: Step, assets: { id: string; name: string }[] = []): string {
  const name = (id: string) => items(t, assets).find(i => i.id === id)?.label ?? 'a layer';
  const at = (n: unknown) => typeof n === 'number' ? `${n.toFixed(1)}s` : '';
  switch (s.op) {
    case 'add': { const i = s.item; return `Add ${s.kind === 'clips' ? 'footage' : s.kind === 'effects' ? clean(i.kind) || 'effect' : s.kind === 'titles' ? `title “${clean(i.text)}”` : s.kind === 'audio' ? 'audio' : s.kind === 'videoOverlays' ? i.chromaKey ? 'green-screen video' : String(i.layout).startsWith('split-') ? 'split screen' : 'video on top' : 'logo'}${i.start !== undefined ? ` at ${at(i.start)}` : ''}`; }
    case 'update': return `Change ${name(s.id)}: ${Object.keys(s.patch ?? {}).slice(0, 4).join(', ')}`;
    case 'remove': return `Remove ${name(s.id)}`;
    case 'cutRange': return `Cut out ${at(s.start)}–${at(s.end)}`;
    case 'moveClip': return `Move ${name(s.id)} to position ${Number(s.index) + 1}`;
    case 'freeze': return `Freeze frame at ${at(s.at)}`;
    case 'replay': return `Slow-motion replay of ${name(s.clipId)}`;
    case 'layer': return `${s.keyframes !== undefined ? 'Animate' : s.attachTo !== undefined ? 'Attach' : s.hidden !== undefined ? (s.hidden ? 'Hide' : 'Show') : 'Rename'} ${name(s.id)}`;
    case 'project': return `Project: ${Object.keys(s.patch ?? {}).join(', ')}`;
    default: return 'Unknown step';
  }
}

function locked(t: Timeline, id: string) { if (t.layerSettings?.[id]?.locked) throw new Error('that layer is locked'); }
function exists(t: Timeline, id: unknown): string { if (typeof id !== 'string' || !kindOf(t, id)) throw new Error('it refers to something that does not exist'); return id; }

/** Removes the footage between two timeline seconds. Layers riding on removed footage go with it; later ones move up. */
export function cutRange(t: Timeline, start: number, end: number): Timeline {
  const total = clipsEnd(t); start = Math.max(0, start); end = Math.min(total, end);
  if (!(end - start >= .05)) throw new Error('the range to cut is empty');
  if (positions(t).some(p => p.end > start && p.start < end && t.layerSettings?.[p.clip.id]?.locked)) throw new Error('locked footage is in that range');
  let next = t;
  for (const at of [end, start]) { const spot = positions(next).find(p => at > p.start + .1 && at < p.end - .1); if (spot) next = splitClip(next, spot.clip.id, at); }
  const gone = new Set(positions(next).filter(p => p.start >= start - .06 && p.end <= end + .06).map(p => p.clip.id));
  // A sliver under the .1s split margin at either edge stays rather than leaving a gap.
  next = { ...next, clips: next.clips.filter(c => !gone.has(c.id)), compounds: next.compounds?.map(g => ({ ...g, members: g.members.filter(id => !gone.has(id)) })) };
  const cut = end - start, attached = (id: string) => !!next.layerSettings?.[id]?.attachment;
  // Layers not riding on a clip: inside the range they go; across it they shorten; after it they move up.
  const shift = <T extends { id: string; start: number; duration: number }>(list: T[]) => list.flatMap(i => {
    if (attached(i.id) || i.start + i.duration <= start) return [i];
    if (i.start >= end) return [{ ...i, start: i.start - cut }];
    if (i.start >= start && i.start + i.duration <= end) return next.layerSettings?.[i.id]?.locked ? [i] : [];
    const from = Math.min(i.start, start), length = i.duration - (Math.min(end, i.start + i.duration) - Math.max(start, i.start));
    return length > .05 ? [{ ...i, start: from, duration: length }] : [];
  });
  // A video on top (a facecam) loses the same seconds as the footage under it, so the two stay in sync: one running
  // across the cut becomes two pieces, one starting inside it starts later in its source.
  const videoOverlays = next.videoOverlays.flatMap(o => {
    if (attached(o.id) || o.start + o.duration <= start || o.start >= end || next.layerSettings?.[o.id]?.locked) return shift([o]);
    const before = start - o.start, after = o.start + o.duration - end, pieces = [];
    if (before > .05) pieces.push({ ...o, duration: before });
    if (after > .05) pieces.push({ ...o, id: before > .05 ? uid() : o.id, start, in: o.in + (end - o.start), duration: after });
    return pieces;
  });
  next = { ...next, titles: shift(next.titles), overlays: shift(next.overlays), videoOverlays, effects: shift(next.effects), captions: shift(next.captions), audio: shift(next.audio) };
  return reconcileAttachments(t, next);
}
const clipsEnd = (t: Timeline) => t.clips.reduce((s, c) => s + clipLength(c), 0);

function applyOne(t: Timeline, s: Step, assets: MediaInfo[], selected: string | null): Timeline {
  if (selected && !(s.op === 'update' && s.id === selected) && !(s.op === 'layer' && s.id === selected)) throw new Error('only the selected layer may change');
  switch (s.op) {
    case 'add': {
      if (!(ADDABLE as readonly string[]).includes(s.kind) || !s.item || typeof s.item !== 'object') throw new Error('unknown kind of thing to add');
      const id = typeof s.item.id === 'string' && s.item.id && !kindOf(t, s.item.id) ? s.item.id.slice(0, 100) : uid();
      const defaults: Record<string, unknown> = s.kind === 'clips' ? { speed: 1, volume: 1, zoom: 1, focusX: .5, fade: false } : s.kind === 'titles' ? { ...newTitle(), id } : s.kind === 'audio' ? { volume: .8, fade: true, in: 0 } : s.kind === 'overlays' ? { style: 'color', animation: 'fade' } : s.kind === 'videoOverlays' ? { in: 0, volume: 1, layout: 'pip', x: .78, y: .78, size: .34 } : {};
      const item = { ...defaults, ...s.item, id } as never;
      if (s.kind === 'clips') { const list = [...t.clips], at = Number.isInteger(s.index) ? Math.max(0, Math.min(list.length, s.index!)) : list.length; list.splice(at, 0, item); return { ...t, clips: list }; }
      return { ...t, [s.kind]: [...t[s.kind], item] };
    }
    case 'update': {
      const id = exists(t, s.id); locked(t, id); const kind = kindOf(t, id)!;
      if (!s.patch || typeof s.patch !== 'object') throw new Error('nothing to change');
      const { id: _id, kind: _kind, mask: _mask, ...patch } = s.patch as Record<string, unknown>;
      return { ...t, [kind]: t[kind].map(i => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch } as Record<string, unknown>;
        // A highlight moved or retimed has to be traced again.
        if ('kind' in i && i.kind === 'highlight' && ['start', 'duration', 'x', 'y', 'w', 'h'].some(k => k in patch)) delete next.mask;
        // Corrected caption words keep their timing only while the word count matches.
        if (kind === 'captions' && typeof patch.text === 'string' && 'words' in i && i.words && patch.text.split(/\s+/).filter(Boolean).length !== i.words.length) delete next.words;
        return next;
      }) };
    }
    case 'remove': { const id = exists(t, s.id); locked(t, id); const kind = kindOf(t, id)!; const clips = t.clips.filter(c => c.id !== id); return { ...t, [kind]: (t[kind] as { id: string }[]).filter(i => i.id !== id), compounds: t.compounds?.map(g => ({ ...g, members: g.members.filter(m => m !== id) })).filter(g => g.members.some(m => clips.some(c => c.id === m))) }; }
    case 'cutRange': if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) throw new Error('the range needs a start and an end'); return cutRange(t, Math.min(s.start, s.end), Math.max(s.start, s.end));
    case 'moveClip': {
      const from = t.clips.findIndex(c => c.id === s.id); if (from < 0) throw new Error('that clip does not exist'); locked(t, s.id);
      const list = [...t.clips], [clip] = list.splice(from, 1); list.splice(Math.max(0, Math.min(list.length, Math.round(Number(s.index) || 0))), 0, clip); return { ...t, clips: list };
    }
    case 'freeze': { if (!t.clips.some(c => c.id === s.clipId)) throw new Error('that clip does not exist'); return freezeAt(t, s.clipId, Number(s.at), Math.max(.2, Math.min(5, Number(s.seconds) || 1))); }
    case 'replay': { if (!t.clips.some(c => c.id === s.clipId)) throw new Error('that clip does not exist'); return replayClip(t, s.clipId); }
    case 'layer': {
      const id = exists(t, s.id); locked(t, id);
      let next = t;
      if (s.attachTo !== undefined) { if (s.attachTo !== null && !t.clips.some(c => c.id === s.attachTo)) throw new Error('that clip does not exist'); next = attachLayer(next, id, s.attachTo ?? undefined); }
      const setting: LayerSettings = { ...next.layerSettings?.[id] };
      if (typeof s.name === 'string') setting.name = s.name.slice(0, 80) || undefined;
      if (typeof s.hidden === 'boolean') setting.hidden = s.hidden;
      if (s.keyframes !== undefined) { if (kindOf(t, id) === 'clips') throw new Error('footage is animated with update keyframes'); setting.keyframes = s.keyframes?.length ? s.keyframes as LayerSettings['keyframes'] : undefined; }
      return { ...next, layerSettings: { ...next.layerSettings, [id]: setting } };
    }
    case 'project': {
      const p = s.patch ?? {}, next = { ...t };
      if (typeof p.name === 'string') next.name = p.name.slice(0, 80);
      if (p.format) next.format = p.format;
      if (typeof p.duck === 'boolean') next.duck = p.duck;
      // A named look (captionStyle {preset:'gold'}) brings its whole style; any field given alongside still wins.
      if (p.captionStyle && typeof p.captionStyle === 'object') next.captionStyle = { ...t.captionStyle, ...(CAPTION_PRESETS.find(x => x.id === (p.captionStyle as { preset?: string }).preset)?.style ?? {}), ...p.captionStyle };
      return next;
    }
    default: throw new Error('unknown step');
  }
}

/**
 * Applies steps in order. A step that fails, or leaves the timeline invalid, is skipped with its reason, and the rest
 * still apply. `enabled` switches steps off without forgetting them (the review's checkboxes).
 */
export function applySteps(t: Timeline, steps: Step[], assets: MediaInfo[], { selected = null, enabled }: { selected?: string | null; enabled?: boolean[] } = {}) {
  let current = t; const results: StepResult[] = [];
  steps.forEach((s, i) => {
    const label = (() => { try { return describe(current, s, assets); } catch { return 'Step'; } })();
    if (enabled?.[i] === false) { results.push({ label }); return; }
    try {
      current = validateTimeline(applyOne(current, s, assets, selected), assets);
      results.push({ label });
    } catch (e) { results.push({ label, error: e instanceof Error ? e.message.replace(/^Invalid /, 'invalid ').replace(/\.$/, '') : 'it could not be applied' }); }
  });
  return { timeline: current, results };
}

/** The AI's reply, made safe: at most 60 steps, each a plain object with a known op. */
export function readSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).filter((s): s is Step => !!s && typeof s === 'object' && typeof (s as { op?: unknown }).op === 'string').map(s => ({ ...s, why: typeof s.why === 'string' ? s.why.slice(0, 200) : undefined }));
}
