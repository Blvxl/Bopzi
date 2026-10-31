import { collections, items } from './editing';
import type { Media, Timeline } from './model';
export type EditDifference = { id: string; action: 'added' | 'updated' | 'removed'; kind: string; label: string; details: string[]; beforeStart?: number; afterStart?: number };
const names: Record<string, string> = { start: 'Start', duration: 'Duration', in: 'In point', out: 'Out point', speed: 'Speed', zoom: 'Zoom', amount: 'Zoom target', x: 'Horizontal position', y: 'Vertical position', size: 'Size', color: 'Colour', text: 'Text', from: 'Count from', to: 'Count to', prefix: 'Prefix', suffix: 'Suffix', easing: 'Easing', countDuration: 'Counting time', rampDuration: 'Zoom timing', animation: 'Animation', volume: 'Volume', mode: 'Zoom style', font: 'Font', fade: 'Fade', focusX: 'Framing', assetId: 'Source', style: 'Look', shape: 'Shape', w: 'Width', h: 'Height', bounce: 'Bounce', countDelay: 'Count delay', format: 'Number format' };
const display = (v: unknown): string => v === undefined ? 'default' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : typeof v === 'boolean' ? v ? 'on' : 'off'
  // A colour grade, transition and the like: its own fields, e.g. "saturate 0, contrast 1.15".
  : v && typeof v === 'object' ? Array.isArray(v) ? `${v.length} point${v.length === 1 ? '' : 's'}` : Object.entries(v).map(([k, x]) => `${k} ${display(x)}`).join(', ').slice(0, 70) : String(v).slice(0, 70);
/** Compare actual validated timelines, not the AI's claimed summary. */
export function timelineDifferences(before: Timeline, after: Timeline, assets: Media[] = []) {
  const oldItems = items(before, assets), newItems = items(after, assets), differences: EditDifference[] = [];
  for (const kind of collections) {
    const previous = new Map(before[kind].map(item => [item.id, item]));
    const proposed = new Map(after[kind].map(item => [item.id, item]));
    for (const id of new Set([...previous.keys(), ...proposed.keys()])) {
      const a = previous.get(id), b = proposed.get(id), old = oldItems.find(i => i.id === id), next = newItems.find(i => i.id === id);
      const action = !a ? 'added' : !b ? 'removed' : 'updated';
      const details: string[] = [];
      if (a && b) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (key === 'id') continue;
          const av = (a as unknown as Record<string, unknown>)[key], bv = (b as unknown as Record<string, unknown>)[key];
          if (JSON.stringify(av) === JSON.stringify(bv)) continue;
          details.push(key === 'mask' ? 'Object trace changed' : key === 'keyframes' ? 'Motion keyframes changed' : key === 'speedPoints' ? 'Speed curve changed' : key === 'points' ? 'Object selection changed' : key === 'curve' ? 'Easing curve changed' : `${names[key] ?? key}: ${display(av)} → ${display(bv)}`);
        }
        if (kind === 'clips' && before.clips.findIndex(i => i.id === id) !== after.clips.findIndex(i => i.id === id)) details.push('Clip order changed');
        if (JSON.stringify(before.layerSettings?.[id]) !== JSON.stringify(after.layerSettings?.[id])) details.push('Layer settings changed');
        if (old && next && Math.abs(old.start - next.start) > .001 && !details.some(d => d.startsWith('Start:'))) details.push(`Timeline: ${old.start.toFixed(2)}s → ${next.start.toFixed(2)}s`);
        if (!details.length) continue;
      }
      const description = next ?? old!;
      if (!a || !b) details.push(`${description.start.toFixed(2)}s · ${description.duration.toFixed(2)}s long`);
      if (!a && b) {
        if ('from' in b && 'to' in b) details.push(`Count: ${display(b.from)} → ${display(b.to)}`);
        if ('kind' in b && b.kind === 'zoom') details.push(`Target: ${display(b.amount)}× · ${b.mode === 'hold' ? 'ease in and stay' : 'punch and return'}`);
        if ('in' in b && 'out' in b) details.push(`Source: ${display(b.in)}–${display(b.out)}s · ${display(b.speed)}× speed`);
        if ('volume' in b) details.push(`Volume: ${Math.round(b.volume * 100)}%`);
      }
      differences.push({ id, action, kind, label: description.label, details, beforeStart: old?.start, afterStart: next?.start });
    }
  }
  const settings: string[] = [];
  if (before.name !== after.name) settings.push(`Project name: ${before.name} → ${after.name}`);
  if (before.format !== after.format) settings.push(`Format: ${before.format} → ${after.format}`);
  if (before.mode !== after.mode) settings.push(`Video type: ${before.mode} → ${after.mode}`);
  if ((before.duck !== false) !== (after.duck !== false)) settings.push('Music ducking changed');
  if (JSON.stringify(before.captionStyle) !== JSON.stringify(after.captionStyle)) settings.push('Caption appearance changed');
  if (JSON.stringify(before.compounds ?? []) !== JSON.stringify(after.compounds ?? [])) settings.push('Compound clips changed');
  if (JSON.stringify(before.removedMediaIds ?? []) !== JSON.stringify(after.removedMediaIds ?? [])) settings.push('Project media library changed');
  return { differences, settings, ids: new Set(differences.map(d => d.id)) };
}
