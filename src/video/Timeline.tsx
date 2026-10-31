'use client';
import { Captions, CircleDot, Crosshair, EyeOff, Film, Gauge, Hash, Image as ImageIcon, MonitorPlay, Music2, Shuffle, Sparkles, Type, Volume2, Waves, Zap, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { duration, positions, type Timeline as TimelineData, type Media } from './model';
import type { Beat } from './beats';
import type { Effect } from './motion';
import { TRANSITIONS } from './transitions';
import { PIP_LAYOUTS } from './pip';

/** What an effect chip on the timeline says: an icon for the kind and a short name worth reading at a glance. */
function effectChip(e: Effect): { icon: LucideIcon; label: string; title: string } {
  if (e.kind === 'zoom') return { icon: Crosshair, label: `${e.mode === 'hold' ? 'Stay' : 'Zoom'} ${e.amount.toFixed(2).replace(/0$/, '')}×`, title: e.mode === 'hold' ? `Zoom in and stay at ${e.amount}×` : `Zoom punch to ${e.amount}×` };
  if (e.kind === 'shake') return { icon: Waves, label: 'Shake', title: 'Camera shake' };
  if (e.kind === 'flash') return { icon: Sparkles, label: 'Flash', title: 'Flash' };
  if (e.kind === 'counter') { const v = `${e.prefix}${e.to.toLocaleString('en-US')}${e.suffix}`.trim(); return { icon: Hash, label: v, title: `Counter to ${v}` }; }
  if (e.kind === 'blur') return { icon: EyeOff, label: e.style === 'pixelate' ? 'Pixelate' : 'Blur', title: e.style === 'pixelate' ? 'Pixelated area' : 'Blurred area' };
  if (e.kind === 'bar') return { icon: Gauge, label: e.label || 'Bar', title: `Progress bar ${Math.round(e.from)}% → ${Math.round(e.to)}%` };
  return { icon: CircleDot, label: e.label || 'Highlight', title: 'Highlight' };
}
import { packTimelineRows } from './timeline-layout';
import type { Insight } from './insights';

type Retime = { start?: number; duration?: number; in?: number };
type Props = { timeline: TimelineData; assets: Media[]; time: number; selected: string | null; selectedIds?: string[]; zoom: number; /** Snap to cuts and edges (CapCut's magnet). */ magnet?: boolean; /** The music's beats, shown on the audio track and snapped to. */ beats?: Beat[]; compact?: boolean; changed?: Set<string>; /** Items on their way out (an AI edit being undone): they fade before they go. */ leaving?: Set<string>; /** What Bopzi heard and saw (speaker turns, shot changes, laughs), on the timeline. */ insights?: Insight[]; clipBar?: ReactNode; onSeek: (time: number) => void; onSelect: (id: string, additive?: boolean, range?: boolean) => void; onReorder: (id: string, before: string) => void; onAdd: (id: string) => void; onRetime: (id: string, patch: Retime, label: string) => void; onToggleCompound?: (id: string) => void; onTrim: (id: string, start: number, end: number) => void };
const NO_CHANGES = new Set<string>(), NO_BEATS: Beat[] = [], NO_INSIGHTS: Insight[] = [];
/** A drag in progress: how the item would look if released now. */
type Drag = { id: string; start: number; duration: number; guide?: number } | { id: string; reorder: number; x: number };
const SNAP_PX = 8, MIN = .1;

/**
 * The timeline, CapCut-style. The video track is magnetic: clips sit end to end, and trimming one moves the ones after
 * it. Every other track is free: drag an item to move it, drag either edge to trim it. Moves and trims snap to the
 * playhead and to the edges of everything else, shown by a guide line. Nothing changes until the pointer is released,
 * and each gesture is one undo step. `compact` is the story strip: clips large, other tracks as thin lanes.
 */
export default function Timeline({ timeline, assets, time, selected, selectedIds = selected ? [selected] : [], zoom, magnet = true, beats = NO_BEATS, compact = false, changed = NO_CHANGES, leaving = NO_CHANGES, insights = NO_INSIGHTS, clipBar, onSeek, onSelect, onReorder, onAdd, onRetime, onTrim, onToggleCompound }: Props) {
  const collapsed = timeline.compounds?.filter(g => g.collapsed) ?? [], hidden = new Set(collapsed.flatMap(g => g.members).filter(id => !timeline.clips.some(c => c.id === id)));
  timeline = { ...timeline, titles: timeline.titles.filter(i => !hidden.has(i.id)), effects: timeline.effects.filter(i => !hidden.has(i.id)), overlays: timeline.overlays.filter(i => !hidden.has(i.id)), videoOverlays: timeline.videoOverlays.filter(i => !hidden.has(i.id)), captions: timeline.captions.filter(i => !hidden.has(i.id)), audio: timeline.audio.filter(i => !hidden.has(i.id)) };
  const scroller = useRef<HTMLDivElement>(null), tracks = useRef<HTMLDivElement>(null); const total = duration(timeline); const seconds = Math.max(10, Math.ceil((total + 2) / 5) * 5), px = zoom, width = seconds * px;
  const [drag, setDrag] = useState<Drag | null>(null), [scrubGuide, setScrubGuide] = useState<number>();
  const spots = positions(timeline);
  const labelContents = useRef<HTMLDivElement>(null);
  const groups = { captions: timeline.captions, logos: timeline.overlays, effects: timeline.effects, text: timeline.titles, pip: timeline.videoOverlays, audio: timeline.audio };
  const previousRows = useRef<Record<string, Map<string, number>>>({});
  const layouts = Object.fromEntries(Object.entries(groups).map(([name, entries]) => {
    const layout = packTimelineRows(entries.map(item => drag?.id === item.id && !('reorder' in drag) ? { ...item, start: drag.start, duration: drag.duration } : item), px, previousRows.current[name], drag?.id ?? selected ?? undefined);
    previousRows.current[name] = layout.rows;
    return [name, layout];
  }));
  const rowFor = (id: string) => Object.values(layouts).map(layout => layout.rows.get(id)).find(row => row !== undefined) ?? 0;
  const rowHeight = compact ? 12 : 34;
  /** Alt held during a gesture turns the magnet off for that moment, as in CapCut. */
  let unsnapped = false;
  const seekAt = (clientX: number, snapping = false) => {
    const rect = tracks.current?.getBoundingClientRect(); if (!rect) return;
    const raw = Math.min(total, Math.max(0, (clientX - rect.left) / px));
    // Scrubbing sticks to cuts and item edges, so landing exactly on a cut to split it is easy.
    const s = snapping ? snap(raw, [0, total, ...spots.flatMap(p => [p.start, p.end]), ...[...timeline.titles, ...timeline.overlays, ...timeline.videoOverlays, ...timeline.effects, ...timeline.audio].flatMap(i => [i.start, i.start + i.duration]), ...beats.map(b => b.time)]) : { value: raw, hit: undefined };
    setScrubGuide(s.hit); onSeek(Math.min(total, s.value));
  };
  const seek = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.defaultPrevented || (e.target as HTMLElement).closest('button, input, select, .ve-clip-bar')) return;
    e.preventDefault(); e.stopPropagation(); unsnapped = e.altKey; seekAt(e.clientX, true);
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { unsnapped = ev.altKey; seekAt(ev.clientX, true); };
    const finish = () => { setScrubGuide(undefined); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', finish); target.removeEventListener('lostpointercapture', finish); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish, { once: true }); target.addEventListener('pointercancel', finish, { once: true }); target.addEventListener('lostpointercapture', finish, { once: true });
  };
  /** Every edge a moving item can stick to: the playhead, the cut's ends, clip boundaries and every other item. */
  const anchorsFor = (id: string) => {
    const free = [...timeline.titles, ...timeline.overlays, ...timeline.videoOverlays, ...timeline.effects, ...timeline.captions, ...timeline.audio].filter(i => i.id !== id);
    return [0, total, time, ...spots.flatMap(s => [s.start, s.end]), ...free.flatMap(i => [i.start, i.start + i.duration]), ...beats.map(b => b.time)];
  };
  const snap = (value: number, anchors: number[]) => { if (!magnet || unsnapped) return { value, hit: undefined }; let best = value, gap = SNAP_PX / px; for (const a of anchors) if (Math.abs(a - value) < gap) { gap = Math.abs(a - value); best = a; } return { value: best, hit: best !== value || anchors.includes(value) ? best : undefined }; };
  /** One gesture on an item. A press without movement selects it and moves the playhead there. */
  const grab = (e: React.PointerEvent<HTMLElement>, id: string, part: 'move' | 'in' | 'out') => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    const target = e.currentTarget, x0 = e.clientX, additive = e.ctrlKey || e.metaKey, range = e.shiftKey; let moved = false, last: Drag | null = null;
    try { target.setPointerCapture(e.pointerId); } catch { /* the gesture still follows events on the item */ }
    const spot = spots.find(s => s.clip.id === id), item = [...timeline.titles, ...timeline.overlays, ...timeline.videoOverlays, ...timeline.effects, ...timeline.captions, ...timeline.audio].find(i => i.id === id);
    // Audio and videos on top play part of a file, so trimming stays inside it (a still image has no end).
    const audio = timeline.audio.find(a => a.id === id) ?? timeline.videoOverlays.find(o => o.id === id), audioAsset = audio && assets.find(m => m.id === audio.assetId && m.kind !== 'image');
    const anchors = anchorsFor(id);
    const update = (d: Drag) => { last = d; setDrag(d); };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return; moved = true; unsnapped = ev.altKey;
      const dx = (ev.clientX - x0) / px;
      if (spot) {
        const { clip, start } = spot; const asset = assets.find(a => a.id === clip.assetId); const limit = asset?.kind === 'image' ? 60 : asset?.duration ?? clip.out;
        if (part === 'move') {
          // Reordering: the clip goes before the first clip whose middle is to the right of the pointer.
          const rect = tracks.current!.getBoundingClientRect(), at = (ev.clientX - rect.left) / px;
          const others = spots.filter(s => s.clip.id !== id); update({ id, reorder: others.filter(s => (s.start + s.end) / 2 < at).length, x: at });
        } else if (part === 'in') {
          // On the magnetic track the clip keeps its place and its end moves, so the end is what snaps.
          const rawIn = Math.min(clip.out - MIN * clip.speed, Math.max(0, clip.in + dx * clip.speed));
          const s = snap(start + (clip.out - rawIn) / clip.speed, anchors.filter(a => a > start && a <= spot.end));
          const inPoint = Math.min(clip.out - MIN * clip.speed, Math.max(0, clip.out - (s.value - start) * clip.speed));
          update({ id, start, duration: (clip.out - inPoint) / clip.speed, guide: s.hit });
        } else {
          const raw = start + (clip.out - clip.in) / clip.speed + dx, s = snap(raw, anchors.filter(a => a <= start || a >= spot.end || a === time));
          const out = Math.min(limit, Math.max(clip.in + MIN * clip.speed, clip.in + (s.value - start) * clip.speed));
          update({ id, start, duration: (out - clip.in) / clip.speed, guide: s.hit });
        }
        return;
      }
      if (!item) return;
      const end = item.start + item.duration;
      if (part === 'move') {
        // Either edge may snap; whichever is closer wins, and the length never changes.
        const a = snap(Math.max(0, item.start + dx), anchors), b = snap(Math.max(item.duration, end + dx), anchors);
        const useEnd = b.hit !== undefined && (a.hit === undefined || Math.abs(b.value - (end + dx)) < Math.abs(a.value - (item.start + dx)));
        const start = Math.max(0, useEnd ? b.value - item.duration : a.value);
        update({ id, start, duration: item.duration, guide: useEnd ? b.hit : a.hit });
      } else if (part === 'in') {
        // Audio can only start as early as its file allows; other items can grow freely.
        const earliest = audio && audioAsset ? Math.max(0, audio.start - audio.in) : 0;
        const s = snap(Math.min(end - MIN, Math.max(earliest, item.start + dx)), anchors);
        update({ id, start: Math.min(end - MIN, Math.max(earliest, s.value)), duration: end - Math.min(end - MIN, Math.max(earliest, s.value)), guide: s.hit });
      } else {
        const longest = audio && audioAsset ? audioAsset.duration - audio.in : Infinity;
        const s = snap(Math.max(item.start + MIN, end + dx), anchors);
        update({ id, start: item.start, duration: Math.min(longest, Math.max(MIN, s.value - item.start)), guide: s.hit });
      }
    };
    const finish = (commit: boolean) => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel);
      setDrag(null);
      if (!commit) return;
      if (!moved || !last) { target.focus({ preventScroll: true }); onSelect(id, additive, range); seekAt(x0); return; }
      const d = last as Drag;
      if ('reorder' in d) { const others = spots.filter(s => s.clip.id !== id); onReorder(id, others[d.reorder]?.clip.id ?? ''); return; }
      if (spot) {
        const { clip } = spot;
        if (part === 'in') onTrim(id, clip.out - d.duration * clip.speed, clip.out); else onTrim(id, clip.in, clip.in + d.duration * clip.speed);
        return;
      }
      if (!item) return;
      const patch: Retime = { start: Math.round(d.start * 1000) / 1000, duration: Math.round(d.duration * 1000) / 1000 };
      // Trimming audio from the left also moves where its sound starts, so the rest stays in sync.
      if (audio && part === 'in') patch.in = Math.max(0, Math.round((audio.in + d.start - audio.start) * 1000) / 1000);
      onRetime(id, patch, part === 'move' ? 'Move item' : 'Trim item');
    };
    const up = () => finish(true), cancel = () => finish(false);
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  const mark = (id: string, base: string) => `${base}${selectedIds.includes(id) ? ' is-selected' : ''}${changed.has(id) ? ' is-changed' : ''}${leaving.has(id) ? ' is-leaving' : ''}${drag?.id === id ? ' is-dragging' : ''}`;
  /** Where an item is drawn: its own place, or where the drag would put it. */
  const place = (id: string, start: number, length: number) => { const d = drag?.id === id && !('reorder' in drag) ? drag : null; return { left: (d?.start ?? start) * px, width: Math.max(6, (d?.duration ?? length) * px), top: (compact ? 3 : 5) + rowFor(id) * rowHeight }; };
  const handles = (id: string) => !compact && <><span className="ve-trim-handle is-left" title="Drag to trim the start" onPointerDown={e => grab(e, id, 'in')}/><span className="ve-trim-handle is-right" title="Drag to trim the end" onPointerDown={e => grab(e, id, 'out')}/></>;
  const item = (id: string, start: number, length: number, className: string, title: string, content: ReactNode) => <button key={id} type="button" className={mark(id, className)} style={place(id, start, length)} title={title} onPointerDown={e => grab(e, id, 'move')} onClick={e => { if (e.detail === 0) { onSelect(id); onSeek(start); } }}>{!compact && content}{handles(id)}</button>;
  const lane = (name: string, items: ReactNode, show: boolean) => show && <div className={`ve-track ve-lane-${name}`} style={{ height: (layouts[name]?.count ?? 1) * rowHeight }} aria-label={name}>{items}</div>;
  const selectedSpot = spots.find(p => p.clip.id === selected);
  const labels = [['Captions', <Captions key="c" size={14}/>], ['Logos', <ImageIcon key="o" size={14}/>], ['Effects', <Zap key="e" size={14}/>], ['Text', <Type key="t" size={14}/>], ['PiP', <MonitorPlay key="p" size={14}/>], ['Video', <Film key="v" size={14}/>], ['Audio', <Music2 key="a" size={14}/>]] as const;
  // The story strip only shows the lanes that have something in them.
  const shown = (count: number) => count > 0;
  // While a clip is being reordered, the line shows where it will land.
  const reorderLine = drag && 'reorder' in drag ? (() => { const others = spots.filter(s => s.clip.id !== drag.id); return others[drag.reorder]?.start ?? others.at(-1)?.end ?? 0; })() : null;
  const guide = drag && !('reorder' in drag) ? drag.guide : scrubGuide;
  return <div className={`ve-timeline-body${compact ? ' is-compact' : ''}`}>
    {!compact && <div className="ve-track-labels"><div ref={labelContents}><span/>{labels.filter(([name]) => name === 'Video' || groups[name.toLowerCase() as keyof typeof groups].length > 0).map(([name, icon]) => <span key={name} style={name === 'Video' ? undefined : { height: (layouts[name.toLowerCase()]?.count ?? 1) * rowHeight }} className={`ve-label-${name.toLowerCase()}`}>{icon}{name}</span>)}</div></div>}
    <div className="ve-track-scroll" ref={scroller} onScroll={e => { if (labelContents.current) labelContents.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`; }}><div ref={tracks} className={`ve-tracks${drag ? ' is-dragging' : ''}`} style={{ width }} onPointerDown={seek}>
      <div className="ve-ruler" title="Click or drag to preview any moment">{Array.from({ length: Math.ceil(seconds / 5) + 1 }, (_, i) => <span key={i} style={{ left: i * 5 * px }}>{Math.floor(i * 5 / 60)}:{String(i * 5 % 60).padStart(2, '0')}</span>)}</div>
      {lane('captions', timeline.captions.map(c => item(c.id, c.start, c.duration, 've-timeline-caption-item', c.text, c.text)), shown(timeline.captions.length))}
      {lane('logos', timeline.overlays.map(o => item(o.id, o.start, o.duration, 've-timeline-overlay', o.source === 'icon' ? `${o.icon} logo` : 'Image', o.source === 'icon' ? o.icon : assets.find(a => a.id === o.assetId)?.name)), shown(timeline.overlays.length))}
      {lane('effects', timeline.effects.map(e => { const chip = effectChip(e); return item(e.id, e.start, e.duration, `ve-timeline-effect is-${e.kind}${e.kind === 'zoom' && e.mode === 'hold' ? ' is-hold' : ''}`, chip.title, <><chip.icon size={11} aria-hidden/><span>{chip.label}</span>{e.sound && <Volume2 size={10} className="ve-chip-sound" aria-label="with sound"/>}</>); }), shown(timeline.effects.length))}
      {lane('text', timeline.titles.map(t => item(t.id, t.start, t.duration, 've-timeline-title', t.text, <><Type size={12}/>{t.text}</>)), shown(timeline.titles.length))}
      {lane('pip', timeline.videoOverlays.map(o => { const a = assets.find(m => m.id === o.assetId); return item(o.id, o.start, o.duration, 've-timeline-pip', `${a?.name ?? 'Video'} · ${PIP_LAYOUTS.find(l => l.id === o.layout)?.label ?? ''}${o.chromaKey ? ' · green screen' : ''}`, <><MonitorPlay size={12}/><span>{a?.name ?? 'Video'}</span></>); }), shown(timeline.videoOverlays.length))}
      <div className="ve-track ve-video-track" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const asset = e.dataTransfer.getData('bopzi-media'); if (asset) onAdd(asset); }}>
        {spots.map(({ clip, start, end }, i) => { const compound = collapsed.find(g => g.members.includes(clip.id)), members = compound ? spots.filter(p => compound.members.includes(p.clip.id)) : []; if (compound && members[0].clip.id !== clip.id) return null; const blockEnd = compound ? members.at(-1)!.end : end; const a = assets.find(a => a.id === clip.assetId); const d = drag?.id === clip.id && !('reorder' in drag) ? drag : null; return <button type="button" key={clip.id} className={mark(clip.id, 've-timeline-clip' + (compound ? ' is-compound' : ''))} style={{ left: start * px, width: Math.max(8, (d?.duration ?? blockEnd - start) * px), backgroundImage: a?.poster ? `linear-gradient(0deg,#0b0a09ad,#0b0a0920),url("${a.poster}")` : undefined }} onDoubleClick={() => { if (compound) onToggleCompound?.(compound.id); }} onPointerDown={e => grab(e, clip.id, 'move')} onClick={e => { if (e.detail === 0) { onSelect(clip.id); onSeek(start); } }}><small>{String(i + 1).padStart(2, '0')}</small><span>{compound ? '▧ ' + compound.name : a?.name ?? 'Missing media'}</span>{clip.speed !== 1 && <b>{clip.speed}×</b>}{!compound && !clip.speedPoints && clip.freeze === undefined && <><span className="ve-trim-handle is-left" title="Drag to trim the start" onPointerDown={e => grab(e, clip.id, 'in')}/><span className="ve-trim-handle is-right" title="Drag to trim the end" onPointerDown={e => grab(e, clip.id, 'out')}/></>}</button>; })}
        {/* What Bopzi heard and saw: speaker turns as coloured bands, shot changes as ticks, laughs as dots. */}
        {insights.length > 0 && <div className="ve-insights" aria-label="Speakers, shots and laughs">{insights.map((n, i) => <button key={i} type="button" tabIndex={-1}
          className={`ve-insight is-${n.kind}${n.kind === 'speaker' ? ` is-s${((n.speaker ?? 0) % 4) + 1}` : ''}`}
          style={{ left: n.start * px, width: n.kind === 'shot' ? undefined : Math.max(4, (n.end - n.start) * px - 1) }}
          title={n.kind === 'speaker' ? `${n.name ?? `Speaker ${(n.speaker ?? 0) + 1}`}: “${n.label.slice(0, 120)}${n.label.length > 120 ? '…' : ''}”` : n.label}
          onPointerDown={e => e.stopPropagation()} onClick={() => onSeek(n.start)}/>)}</div>}        {/* A transition shows as a small badge on its cut. */}
        {spots.map(({ clip, start }) => clip.transition && <i key={`t-${clip.id}`} className="ve-cut-badge" style={{ left: start * px }} title={`${TRANSITIONS.find(t => t.id === clip.transition!.kind)?.label ?? 'Transition'} · ${clip.transition.duration.toFixed(2)} s`} aria-hidden><Shuffle size={10}/></i>)}
        {!timeline.clips.length && <span className="ve-empty-track">Drag footage here, or add it from Media</span>}
        {clipBar && selectedSpot && !drag && <div className="ve-clip-bar" style={{ left: Math.max(4, selectedSpot.start * px) }}>{clipBar}</div>}
      </div>
      {lane('audio', timeline.audio.map(a => item(a.id, a.start, a.duration, 've-timeline-audio', assets.find(m => m.id === a.assetId)?.name ?? 'Audio', <><Music2 size={12}/><span>{assets.find(m => m.id === a.assetId)?.name}</span><i aria-hidden/></>)).concat(beats.length && !compact ? [<div key="beats" className="ve-beats" aria-hidden>{beats.map((b, i) => <i key={i} className={b.strong ? 'is-strong' : undefined} style={{ left: b.time * px }}/>)}</div>] : []), shown(timeline.audio.length))}
      {guide !== undefined && <i className="ve-snap-guide" style={{ left: guide * px }} aria-hidden/>}
      {reorderLine !== null && <i className="ve-reorder-line" style={{ left: reorderLine * px }} aria-hidden/>}
      <div className="ve-playhead" style={{ left: time * px }} role="slider" tabIndex={total ? 0 : -1} aria-label="Preview position" aria-valuemin={0} aria-valuemax={total} aria-valuenow={time} aria-valuetext={`${time.toFixed(2)} seconds`} aria-orientation="horizontal" onKeyDown={e => { let next: number; if (e.key === 'ArrowLeft') next = time - (e.shiftKey ? 1 : 1 / 30); else if (e.key === 'ArrowRight') next = time + (e.shiftKey ? 1 : 1 / 30); else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = total; else return; e.preventDefault(); e.stopPropagation(); onSeek(Math.min(total, Math.max(0, next))); }}><i title="Drag to scrub the preview"/><span/></div>
    </div></div>
  </div>;
}
