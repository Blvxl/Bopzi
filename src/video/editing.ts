import { positions, uid, type Timeline } from './model';

export type LayerSettings = { name?: string; hidden?: boolean; locked?: boolean; attachment?: { clipId: string; offset: number }; keyframes?: import('./clip-motion').Keyframe[] };
export const collections = ['clips', 'titles', 'overlays', 'videoOverlays', 'effects', 'captions', 'audio'] as const;
export function items(t: Timeline, assets: { id: string; name: string }[] = []) {
  const ranges = positions(t);
  return collections.flatMap(kind => t[kind].map(item => ({ id: item.id, kind, start: 'start' in item ? item.start : ranges.find(p => p.clip.id === item.id)!.start, duration: 'duration' in item ? item.duration : ranges.find(p => p.clip.id === item.id)!.end - ranges.find(p => p.clip.id === item.id)!.start, label: t.layerSettings?.[item.id]?.name || ('assetId' in item ? assets.find(a => a.id === item.assetId)?.name : undefined) || ('text' in item ? item.text : 'kind' in item ? item.kind === 'counter' ? `Counter → ${item.to}` : item.kind : kind === 'clips' ? 'Footage' : kind === 'audio' ? 'Audio' : 'Logo / image') })));
}
export function patchItem(t: Timeline, id: string, patch: Record<string, unknown>): Timeline {
  if (t.layerSettings?.[id]?.locked) return t;
  const next = { ...t };
  for (const kind of collections) Object.assign(next, { [kind]: t[kind].map(item => item.id === id ? { ...item, ...patch, id: item.id, ...('kind' in item && item.kind === 'zoom' && item.mode === 'hold' && typeof patch.duration === 'number' ? { rampDuration: Math.min(item.rampDuration ?? item.duration, patch.duration) } : {}) } : item) });
  return next;
}
export function duplicateItem(t: Timeline, id: string): { timeline: Timeline; id: string } {
  const next = { ...t }, copyId = uid();
  for (const kind of collections) Object.assign(next, { [kind]: t[kind].flatMap(item => item.id === id ? [item, { ...item, id: copyId }] : [item]) });
  next.layerSettings = { ...t.layerSettings, [copyId]: { ...t.layerSettings?.[id], locked: false, name: `${items(t).find(i => i.id === id)?.label || 'Layer'} copy` } };
  return { timeline: next, id: copyId };
}
/** Preserve timing of footage; hidden graphics/audio are omitted consistently in preview and export. */
export function visibleTimeline(t: Timeline): Timeline {
  const next = { ...t };
  for (const kind of collections) if (kind !== 'clips') Object.assign(next, { [kind]: t[kind].filter(item => !t.layerSettings?.[item.id]?.hidden) });
  return next;
}
/** Selected scope cannot accidentally rewrite other elements. Locked layers are protected in either scope. */
export function mergeAiEdit(before: Timeline, proposed: Timeline, selected: string | null): Timeline {
  if (selected && !items(before).some(i => i.id === selected)) throw new Error('Select an existing element first.');
  const next = selected ? { ...before } : { ...proposed, compounds: proposed.compounds ?? before.compounds, removedMediaIds: proposed.removedMediaIds ?? before.removedMediaIds, layerSettings: before.layerSettings };
  for (const kind of collections) {
    if (selected) Object.assign(next, { [kind]: before[kind].map(item => item.id === selected && !before.layerSettings?.[item.id]?.locked ? proposed[kind].find(p => p.id === item.id) ?? item : item) });
    else Object.assign(next, { [kind]: [...proposed[kind].map(item => before.layerSettings?.[item.id]?.locked ? before[kind].find(p => p.id === item.id) ?? item : item), ...before[kind].filter(item => before.layerSettings?.[item.id]?.locked && !proposed[kind].some(p => p.id === item.id))] });
  }
  if (before.captions.some(c => before.layerSettings?.[c.id]?.locked)) next.captionStyle = before.captionStyle;
  return next;
}
export function snapTime(value: number, anchors: number[], pixelsPerSecond: number) {
  const nearest = anchors.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a, anchors[0] ?? value);
  return Math.max(0, Math.abs(nearest - value) * pixelsPerSecond <= 8 ? nearest : Math.round(value * 30) / 30);
}

/** Reversible project removal: keep imported data available to saved Undo revisions. */
export function removeMediaFromProject(t: Timeline, assetId: string): Timeline {
  const uses = [...t.clips, ...t.audio, ...t.overlays, ...t.videoOverlays].filter(item => item.assetId === assetId);
  if (uses.some(item => t.layerSettings?.[item.id]?.locked)) throw new Error('Unlock the layers using this file before removing it.');
  return { ...t, removedMediaIds: [...new Set([...(t.removedMediaIds ?? []), assetId])], clips: t.clips.filter(c => c.assetId !== assetId), audio: t.audio.filter(a => a.assetId !== assetId), overlays: t.overlays.filter(o => o.assetId !== assetId), videoOverlays: t.videoOverlays.filter(o => o.assetId !== assetId) };
}
