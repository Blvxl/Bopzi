import { clipLength, positions, uid, type MediaInfo, type Timeline } from './model';
import { collections, items } from './editing';
import { motionLength, sourceAt, transformAt } from './clip-motion';

export type Compound = { id: string; name: string; members: string[]; collapsed: boolean };
export type NamedCut = { id: string; name: string; timeline: Timeline; at: number };
export function deleteSelection(t: Timeline, selection: string | string[]): Timeline {
  const requested = new Set(Array.isArray(selection) ? selection : [selection]);
  const groups = t.compounds?.filter(g => g.collapsed && g.members.some(id => requested.has(id))) ?? [];
  const ids = new Set([...requested, ...groups.flatMap(g => g.members)]);
  if ([...ids].some(id => t.layerSettings?.[id]?.locked)) throw new Error('Unlock the selected layers before deleting them.');
  const next = { ...t, compounds: t.compounds?.filter(g => !groups.includes(g)) };
  for (const kind of collections) Object.assign(next, { [kind]: t[kind].filter(i => !ids.has(i.id)) });
  return next;
}
export function moveFootage(t: Timeline, id: string, direction: number): Timeline {
  const units: Timeline['clips'][] = [], seen = new Set<string>();
  for (const clip of t.clips) { if (seen.has(clip.id)) continue; const group = t.compounds?.find(g => g.members.includes(clip.id)), unit = group ? t.clips.filter(c => group.members.includes(c.id)) : [clip]; unit.forEach(c => seen.add(c.id)); units.push(unit); }
  const index = units.findIndex(unit => unit.some(c => c.id === id)), other = index + direction;
  if (index < 0 || other < 0 || other >= units.length || [...units[index], ...units[other]].some(c => t.layerSettings?.[c.id]?.locked)) return t;
  [units[index], units[other]] = [units[other], units[index]]; return { ...t, clips: units.flat() };
}
export function attachLayer(t: Timeline, id: string, clipId: string | undefined): Timeline {
  const layer = items(t).find(i => i.id === id), clip = positions(t).find(p => p.clip.id === clipId);
  if (!layer || layer.kind === 'clips' || t.layerSettings?.[id]?.locked) return t;
  return { ...t, layerSettings: { ...t.layerSettings, [id]: { ...t.layerSettings?.[id], attachment: clip ? { clipId: clip.clip.id, offset: layer.start - clip.start } : undefined } } };
}
/** Resolve timing at commit, keeping native layer data usable by every renderer and AI review. */
export function reconcileAttachments(before: Timeline, next: Timeline): Timeline {
  const settings = { ...next.layerSettings }, spots = positions(next), old = items(before), removed = new Set<string>();
  const result = { ...next, layerSettings: settings };
  for (const kind of collections) if (kind !== 'clips') Object.assign(result, { [kind]: next[kind].flatMap(layer => {
    let setting = settings[layer.id], a = setting?.attachment;
    if (!a && !old.some(i => i.id === layer.id) && !Object.hasOwn(setting ?? {}, 'attachment') && ['effects', 'titles', 'overlays'].includes(kind)) {
      const owner = spots.find(p => layer.start >= p.start && layer.start < p.end);
      if (owner) { a = { clipId: owner.clip.id, offset: layer.start - owner.start }; setting = settings[layer.id] = { ...setting, attachment: a }; }
    }
    if (!a) return [layer];
    const spot = spots.find(p => p.clip.id === a.clipId); if (!spot) { if (setting.locked) { settings[layer.id] = { ...setting, attachment: undefined }; return [layer]; } removed.add(layer.id); return []; }
    const was = old.find(i => i.id === layer.id), oldAttachment = before.layerSettings?.[layer.id]?.attachment;
    const moved = was && oldAttachment?.clipId === a.clipId && Math.abs(was.start - layer.start) > .00001;
    const offset = moved ? layer.start - spot.start : a.offset, start = Math.max(0, spot.start + offset), delta = start - layer.start;
    settings[layer.id] = { ...setting, attachment: { ...a, offset } };
    return [{ ...layer, start, ...('mask' in layer && layer.mask && delta ? { mask: { ...layer.mask, start: layer.mask.start + delta } } : {}) }];
  }) });
  result.compounds = next.compounds?.map(g => ({ ...g, members: g.members.filter(id => !removed.has(id) && items(result).some(i => i.id === id)) })).filter(g => g.members.some(id => result.clips.some(c => c.id === id)));
  return result;
}
export function makeCompound(t: Timeline, ids: string[], name: string): Timeline {
  const members = items(t).filter(i => ids.includes(i.id)), clips = t.clips.filter(c => ids.includes(c.id));
  if (!clips.length || members.length < 2) throw new Error('Select footage and at least one more layer or clip.');
  if (members.some(i => t.layerSettings?.[i.id]?.locked)) throw new Error('Unlock selected layers before grouping.');
  if (t.compounds?.some(g => g.members.some(id => ids.includes(id)))) throw new Error('Ungroup the existing compound before regrouping its layers.');
  const indices = clips.map(c => t.clips.indexOf(c));
  if (Math.max(...indices) - Math.min(...indices) + 1 !== clips.length) throw new Error('Choose neighbouring footage clips for a compound.');
  let next = t;
  for (const member of members.filter(i => i.kind !== 'clips')) { const clip = positions(t).find(p => member.start >= p.start && member.start < p.end && ids.includes(p.clip.id)) ?? positions(t).find(p => p.clip.id === clips[0].id)!; next = attachLayer(next, member.id, clip.clip.id); }
  return { ...next, compounds: [...(next.compounds ?? []), { id: uid(), name: name.trim().slice(0, 80) || 'Compound clip', members: members.map(m => m.id), collapsed: true }] };
}
export function reorderCompound(t: Timeline, id: string, before: string): Timeline {
  const group = t.compounds?.find(g => g.members.includes(id)), target = t.compounds?.find(g => g.members.includes(before));
  const ids = group ? group.members : [id], moving = t.clips.filter(c => ids.includes(c.id));
  if (!moving.length || ids.includes(before) || moving.some(c => t.layerSettings?.[c.id]?.locked)) return t;
  const rest = t.clips.filter(c => !ids.includes(c.id)), firstTarget = target ? t.clips.find(c => target.members.includes(c.id))?.id : before;
  const at = rest.findIndex(c => c.id === firstTarget); rest.splice(at < 0 ? rest.length : at, 0, ...moving); return { ...t, clips: rest };
}
export function duplicateCompound(t: Timeline, groupId: string): Timeline {
  const g = t.compounds?.find(g => g.id === groupId); if (!g) return t;
  const map = new Map(g.members.map(id => [id, uid()])), clips = t.clips.filter(c => map.has(c.id)), start = positions(t).find(p => p.clip.id === clips[0]?.id)?.start ?? 0;
  const lastIndex = Math.max(...clips.map(c => t.clips.indexOf(c))), end = positions(t)[lastIndex].end, delta = end - start;
  let next: Timeline = { ...t, clips: [...t.clips.slice(0, lastIndex + 1), ...clips.map(c => ({ ...c, id: map.get(c.id)! })), ...t.clips.slice(lastIndex + 1)], layerSettings: { ...t.layerSettings } };
  for (const kind of collections) if (kind !== 'clips') Object.assign(next, { [kind]: [...t[kind], ...t[kind].filter(i => map.has(i.id)).map(i => ({ ...i, id: map.get(i.id)!, start: i.start + delta, ...('mask' in i && i.mask ? { mask: { ...i.mask, start: i.mask.start + delta } } : {}) }))] });
  for (const [id, copy] of map) { const s = t.layerSettings?.[id]; next.layerSettings![copy] = { ...s, locked: false, ...(s?.attachment ? { attachment: { ...s.attachment, clipId: map.get(s.attachment.clipId) ?? s.attachment.clipId } } : {}) }; }
  next = reconcileAttachments(t, next);
  return { ...next, compounds: [...(next.compounds ?? []), { ...g, id: uid(), name: `${g.name} copy`, members: [...map.values()] }] };
}
export function replaceFootage(t: Timeline, id: string, asset: MediaInfo): Timeline {
  const c = t.clips.find(c => c.id === id); if (!c || asset.kind === 'audio' || t.layerSettings?.[id]?.locked) return t;
  const length = clipLength(c), available = asset.kind === 'image' ? 180 : asset.duration;
  if (c.freeze !== undefined) return { ...t, clips: t.clips.map(item => item.id === id ? { ...item, assetId: asset.id, in: 0, out: Math.min(available, 1), freeze: 0 } : item) };
  const required = c.out - c.in;
  if (available + .001 < required) throw new Error(`Choose footage at least ${required.toFixed(2)}s long to preserve this edit's timing.`);
  return { ...t, clips: t.clips.map(item => item.id === id ? { ...item, assetId: asset.id, in: 0, out: required } : item), removedMediaIds: t.removedMediaIds?.filter(id => id !== asset.id) };
}
export function slipClip(t: Timeline, id: string, delta: number, asset: MediaInfo): Timeline {
  return { ...t, clips: t.clips.map(c => { if (c.id !== id || t.layerSettings?.[id]?.locked || c.freeze !== undefined) return c; const shift = Math.min((asset.kind === 'image' ? 180 : asset.duration) - c.out, Math.max(-c.in, delta)); return { ...c, in: c.in + shift, out: c.out + shift }; }) };
}
export function rollCut(t: Timeline, id: string, delta: number, assets: MediaInfo[]): Timeline {
  const index = t.clips.findIndex(c => c.id === id), a = t.clips[index], b = t.clips[index + 1];
  if (!a || !b) throw new Error('Select a clip with another clip after it.');
  if (a.speedPoints || b.speedPoints || a.freeze !== undefined || b.freeze !== undefined) throw new Error('Rolling trim currently needs two clips at constant speed.');
  if (t.layerSettings?.[a.id]?.locked || t.layerSettings?.[b.id]?.locked) throw new Error('Unlock both clips to move this cut.');
  const asset = assets.find(m => m.id === a.assetId), limit = asset?.kind === 'image' ? 180 : asset?.duration ?? a.out;
  const d = Math.max(.1 - clipLength(a), -b.in / b.speed, Math.min(delta, (limit - a.out) / a.speed, clipLength(b) - .1));
  return { ...t, clips: t.clips.map(c => c.id === a.id ? { ...c, out: a.out + d * a.speed } : c.id === b.id ? { ...c, in: b.in + d * b.speed } : c) };
}
/** Insert an actual frozen source frame at the playhead, preserving both moving halves. */
export function freezeAt(t: Timeline, id: string, time: number, seconds = 1): Timeline {
  if (t.layerSettings?.[id]?.locked) throw new Error('Unlock the footage before inserting a freeze frame.');
  const spot = positions(t).find(p => p.clip.id === id); if (!spot) return t;
  const c = spot.clip; if (c.speedPoints || c.freeze !== undefined || c.reverse) throw new Error('Freeze-frame insertion currently needs a forward clip at constant speed.');
  const local = Math.max(0, Math.min(clipLength(c), time - spot.start)), source = sourceAt(c, local), freeze = { ...c, id: uid(), in: c.in, out: c.out, freeze: Math.min(c.out - .001, source), hold: seconds, volume: 0, transition: undefined, keyframes: c.keyframes?.length ? [{ ...transformAt(c.keyframes, local), time: 0, easing: 'linear' as const }] : undefined };
  const clips = [...(local > .05 ? [{ ...c, out: source }] : []), freeze, ...(clipLength(c) - local > .05 ? [{ ...c, id: local > .05 ? uid() : c.id, in: source, transition: undefined }] : [])];
  const settings = { ...t.layerSettings }, tail = clips.at(-1);
  for (const [key, setting] of Object.entries(settings)) if (tail && tail.id !== freeze.id && setting.attachment?.clipId === id && setting.attachment.offset >= local) settings[key] = { ...setting, attachment: { clipId: tail.id, offset: setting.attachment.offset - local } };
  return { ...t, layerSettings: settings, compounds: t.compounds?.map(g => g.members.includes(id) ? { ...g, members: [...new Set([...g.members, ...clips.map(c => c.id)])] } : g), clips: t.clips.flatMap(item => item.id === id ? clips : [item]) };
}
export function replayClip(t: Timeline, id: string): Timeline {
  if (t.layerSettings?.[id]?.locked) throw new Error('Unlock the footage before inserting a replay.');
  const c = t.clips.find(c => c.id === id); if (!c) return t;
  if (c.freeze !== undefined) throw new Error('Select moving footage for a replay.');
  const copy = { ...c, id: uid(), speed: .5, speedPoints: undefined, keyframes: undefined, transition: undefined }, length = motionLength(copy);
  const at = positions(t).find(p => p.clip.id === id)!.end, titleId = uid();
  return { ...t, compounds: t.compounds?.map(g => g.members.includes(id) ? { ...g, members: [...g.members, copy.id, titleId] } : g), clips: t.clips.flatMap(item => item.id === id ? [item, copy] : [item]), titles: [...t.titles, { id: titleId, text: 'REPLAY', start: at, duration: Math.min(2, length), x: .15, y: .15, size: .045, color: '#ffffff', font: 'montserrat', animation: 'fade' }], layerSettings: { ...t.layerSettings, [titleId]: { attachment: { clipId: copy.id, offset: 0 } } } };
}
