import { decodeMask, highlightObjectPixels } from './mask';
import type { Effect, HighlightEffect, HighlightMask } from './motion';

/**
 * Titles, logos, counters and bars that ride along with a traced object, like CapCut's tracking: an arrow on a player,
 * a name over their head, a health bar that walks with them. The item's own x and y are where it sits at its start;
 * after that it moves by however far the object has moved. Pure (no canvas), so preview, export and selection boxes
 * all place it the same way.
 */
const centres = new WeakMap<HighlightMask, ({ x: number; y: number } | null)[]>();
const smoothCentres = new WeakMap<HighlightMask, ({ x: number; y: number } | null)[]>();
/** The middle of the object's traced shape in one frame, as shares of the frame, or null where it was not found. */
function centreOf(e: HighlightEffect, mask: HighlightMask, i: number) {
  let made = centres.get(mask); if (!made) centres.set(mask, made = []);
  if (made[i] !== undefined) return made[i];
  const text = mask.frames[i], { w, h } = mask;
  let result: { x: number; y: number } | null = null;
  if (text) {
    // The same pixels the highlight draws: brushed frames as painted, others with a saved background selection repaired.
    const box: [number, number, number, number] = [(e.x - e.w / 2) * w, (e.y - e.h / 2) * h, (e.x + e.w / 2) * w, (e.y + e.h / 2) * h];
    const pixels = mask.edited ? decodeMask(text, w * h) : highlightObjectPixels(text, w, h, box);
    let sx = 0, sy = 0, n = 0;
    for (let p = 0; p < pixels.length; p++) if (pixels[p]) { sx += p % w; sy += Math.floor(p / w); n++; }
    if (n) result = { x: (sx / n + .5) / w, y: (sy / n + .5) / h };
  }
  made[i] = result; return result;
}
/** The nearest frame to i where the object was found, so a frame it was lost in holds the last known place. */
function nearest(e: HighlightEffect, mask: HighlightMask, i: number) {
  for (let d = 0; d < mask.frames.length; d++) for (const j of [i - d, i + d]) if (j >= 0 && j < mask.frames.length) { const c = centreOf(e, mask, j); if (c) return c; }
  return null;
}
/** Where a highlight's object is at a moment, blended between traced frames. An untraced highlight stays at its centre. */
export function trackedPoint(e: HighlightEffect, t: number) {
  const mask = e.mask; if (!mask?.frames.length) return { x: e.x, y: e.y };
  const f = Math.min(mask.frames.length - 1, Math.max(0, (t - mask.start) * mask.fps)), i = Math.floor(f), mix = f - i;
  const a = centreOf(e, mask, i) ?? nearest(e, mask, i), b = mix > 0 && i + 1 < mask.frames.length ? centreOf(e, mask, i + 1) : null;
  if (!a) return { x: e.x, y: e.y };
  return b ? { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix } : a;
}
/** A short Gaussian window removes segmentation jitter while retaining deliberate subject motion. */
export function trackedPointSmooth(e: HighlightEffect, t: number) {
  const mask = e.mask; if (!mask?.frames.length) return { x: e.x, y: e.y };
  let path = smoothCentres.get(mask);
  if (!path) {
    const raw = mask.frames.map((_, i) => centreOf(e, mask, i));
    path = raw.map((point, i) => {
      if (!point) return null;
      let x = 0, y = 0, total = 0;
      for (let d = -5; d <= 5; d++) {
        const sample = raw[Math.max(0, Math.min(raw.length - 1, i + d))]; if (!sample) continue;
        const weight = Math.exp(-(d * d) / 8); x += sample.x * weight; y += sample.y * weight; total += weight;
      }
      return total ? { x: x / total, y: y / total } : point;
    });
    smoothCentres.set(mask, path);
  }
  const f = Math.min(path.length - 1, Math.max(0, (t - mask.start) * mask.fps)), i = Math.floor(f), mix = f - i;
  const a = path[i] ?? nearest(e, mask, i), b = path[i + 1] ?? (i + 1 < path.length ? nearest(e, mask, i + 1) : null);
  if (!a) return trackedPoint(e, t);
  return b ? { x: a.x + (b.x - a.x) * mix, y: a.y + (b.y - a.y) * mix } : a;
}
/** How far an item that follows a highlight has moved from where it was placed, at a moment, as shares of the frame. */
export function followOffset(item: { start: number; follow?: string }, effects: Effect[], t: number) {
  const target = item.follow ? effects.find((e): e is HighlightEffect => e.id === item.follow && e.kind === 'highlight') : undefined;
  if (!target) return { dx: 0, dy: 0 };
  const from = trackedPoint(target, item.start), now = trackedPoint(target, t);
  return { dx: now.x - from.x, dy: now.y - from.y };
}
/** The item placed where it is at a moment: unchanged unless it follows a highlight. */
export function followed<T extends { start: number; x: number; y: number; follow?: string }>(item: T, effects: Effect[], t: number): T {
  if (!item.follow) return item;
  const { dx, dy } = followOffset(item, effects, t);
  return dx || dy ? { ...item, x: item.x + dx, y: item.y + dy } : item;
}
