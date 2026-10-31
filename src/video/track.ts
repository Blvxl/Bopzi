import { pictureAt } from './clip-motion';
import { drawFootage } from './footage';
import { encodeMask, innerPoint, chooseObjectMask, maskArea, maskBox, seededComponents } from './mask';
import { dimensions, positions, type Media, type Timeline } from './model';
import { type HighlightEffect, type HighlightMask } from './motion';
import type { SegmentReply, SegmentRequest } from './segment.worker';
import { snapToEdges } from './maskLook';

/**
 * Follows a highlighted object through its moment, like CapCut's cut-out: each frame is drawn exactly as the preview
 * shows it and the model cuts the object out, prompted by where it was in the frame before (its box and a point that is
 * surely on it). The outline is stored small; drawing scales it up softly.
 */
const FPS = 24, LOOK = 960, KEEP = 640;
let worker: Worker | null = null, seq = 0;

function segment(request: Omit<SegmentRequest, 'id'>, onLoading?: (share: number) => void) {
  worker ??= new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' });
  const id = ++seq, w = worker;
  return new Promise<Extract<SegmentReply, { masks: Uint8Array[] }>>((resolve, reject) => {
    const listen = (event: MessageEvent<SegmentReply>) => {
      const reply = event.data; if (reply.id !== id) return;
      if ('progress' in reply) { onLoading?.(reply.progress / 100); return; }
      w.removeEventListener('message', listen);
      if ('error' in reply) reject(new Error(reply.error)); else resolve(reply);
    };
    w.addEventListener('message', listen);
    w.postMessage({ ...request, id } satisfies SegmentRequest, [request.pixels.buffer]);
  });
}

const pictures = new Map<string, Promise<HTMLVideoElement | HTMLImageElement>>();
/** Its own muted copy of each piece of footage, so tracing never moves the preview's playhead. */
export function picture(asset: Media) {
  let found = pictures.get(asset.url);
  if (!found) {
    found = new Promise((resolve, reject) => {
      const el = asset.kind === 'image' ? new Image() : Object.assign(document.createElement('video'), { muted: true, preload: 'auto', playsInline: true });
      el.addEventListener(el instanceof HTMLVideoElement ? 'loadeddata' : 'load', () => resolve(el), { once: true });
      el.addEventListener('error', () => reject(new Error(`${asset.name} could not be opened for tracing.`)), { once: true });
      el.src = asset.url;
    });
    pictures.set(asset.url, found);
  }
  return found;
}
export const seek = (video: HTMLVideoElement, time: number) => new Promise<void>(resolve => {
  if (Math.abs(video.currentTime - time) < .001 && video.readyState >= 2) return resolve();
  video.addEventListener('seeked', () => resolve(), { once: true }); video.currentTime = time;
});

/** Shrinks a cut-out to the stored size by sampling the middle of each cell. */
function shrink(mask: Uint8Array, w: number, h: number, tw: number, th: number) {
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) { const sy = Math.min(h - 1, Math.floor((y + .5) * h / th)); for (let x = 0; x < tw; x++) out[y * tw + x] = mask[sy * w + Math.min(w - 1, Math.floor((x + .5) * w / tw))]; }
  return out;
}

/** Nearly every sampled pixel black: the video drew nothing yet. */
function blank(pixels: Uint8ClampedArray) {
  let lit = 0, seen = 0;
  for (let i = 0; i < pixels.length; i += 4 * 97) { seen++; if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 24) lit++; }
  return lit < seen * .02;
}

type Click = { point: [number, number]; label: 0 | 1 };
/**
 * Which of the model's readings is the object on the first frame (the picker's and the tracer's start). With clicks:
 * the one containing every + click and none of the − clicks, rated best by the model, keeping only the connected
 * pieces under a + click so nothing detached comes along. Without: the best-rated one that sits mostly inside the box
 * without filling it (that would be the background), cut to the box. Never requires the box's exact centre to be on
 * the object, which a table or a character between its legs fails.
 */
function firstPick(masks: Uint8Array[], scores: number[], clicks: Click[], box: [number, number, number, number], w: number, h: number): Uint8Array | null {
  const seeds = clicks.filter(c => c.label === 1).map(c => c.point);
  const at = (m: Uint8Array, [x, y]: [number, number]) => m[Math.min(h - 1, Math.max(0, Math.floor(y))) * w + Math.min(w - 1, Math.max(0, Math.floor(x)))];
  if (seeds.length) {
    const fits = (m: Uint8Array) => clicks.filter(c => !!at(m, c.point) === (c.label === 1)).length;
    // One click means "this thing": the whole object, not the part under the cursor (the shirt rather than the
    // player), so the largest reading wins as long as it is clearly one object, not half the frame. More clicks are
    // the user shaping it, and then the model's own rating decides.
    const whole = clicks.length === 1, small = (m: Uint8Array) => maskArea(m) <= w * h * .5;
    const best = masks.map((m, i) => ({ m, score: scores[i], fits: fits(m), area: maskArea(m) })).filter(c => !whole || small(c.m))
      .sort((a, b) => b.fits - a.fits || (whole ? b.area - a.area : b.score - a.score))[0];
    const kept = best && best.fits > 0 ? seededComponents(best.m, w, h, seeds) : null;
    return kept && maskArea(kept) ? kept : null;
  }
  const [x1, y1, x2, y2] = box.map(Math.round), room = Math.max(1, (x2 - x1) * (y2 - y1));
  let pick: Uint8Array | null = null, bestScore = -Infinity;
  masks.forEach((m, i) => {
    const clipped = new Uint8Array(w * h); let inside = 0, total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = y * w + x; if (!m[j]) continue; total++; if (x >= x1 && x < x2 && y >= y1 && y < y2 && !clicks.some(c => c.label === 0 && Math.hypot(c.point[0] - x, c.point[1] - y) < 2)) { clipped[j] = 1; inside++; } }
    if (!total || inside / total < .6 || inside < room * .02 || inside > room * .95) return;
    if (clicks.some(c => c.label === 0 && at(m, c.point))) return;
    if (scores[i] > bestScore) { bestScore = scores[i]; pick = clipped; }
  });
  return pick;
}

/**
 * The object on the highlight's first frame only, for picking it before tracing (CapCut's "select subject"): click to
 * add a part, click to take one away, and see the result right away. The clicks are the highlight's own include and
 * exclude points, so tracing afterwards starts from exactly this cut-out.
 */
export async function pickObject(timeline: Timeline, assets: Media[], effect: HighlightEffect) {
  const [fw, fh] = dimensions(timeline.format), w = Math.round(LOOK * Math.min(1, fw / fh)), h = Math.round(LOOK * Math.min(1, fh / fw));
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const t = effect.start, spot = positions(timeline).find(p => t >= p.start && t < p.end), asset = spot && assets.find(a => a.id === spot.clip.assetId);
  if (!spot || !asset || asset.kind === 'audio') throw new Error('There is no footage under this highlight.');
  const el = await picture(asset);
  if (el instanceof HTMLVideoElement) await seek(el, Math.min(spot.clip.out - .001, pictureAt(spot.clip, t - spot.start)));
  const traceEffects = timeline.effects.filter(e => !(e.kind === 'zoom' && e.follow === effect.id));
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); drawFootage(ctx, el, asset, spot.clip, [spot.start, spot.end], traceEffects, t, w, h);
  let pixels = ctx.getImageData(0, 0, w, h).data;
  if (el instanceof HTMLVideoElement && blank(pixels)) { await new Promise(r => setTimeout(r, 120)); drawFootage(ctx, el, asset, spot.clip, [spot.start, spot.end], traceEffects, t, w, h); pixels = ctx.getImageData(0, 0, w, h).data; }
  const clicks = (effect.points ?? []).map(p => ({ point: [p.x * w, p.y * h] as [number, number], label: p.label }));
  const seeds = clicks.filter(c => c.label === 1).map(c => c.point);
  const box: [number, number, number, number] = [(effect.x - effect.w / 2) * w, (effect.y - effect.h / 2) * h, (effect.x + effect.w / 2) * w, (effect.y + effect.h / 2) * h];
  const points = clicks.length ? clicks.map(c => c.point) : undefined, labels = clicks.length ? clicks.map(c => c.label) : undefined;
  // Once something is clicked, the clicks alone say what the object is, wherever it is; before that, the box does.
  const reply = await segment({ width: w, height: h, pixels: pixels.slice(), box: seeds.length ? undefined : box, points, labels });
  const found = reply.present ? firstPick(reply.masks, reply.scores, clicks, box, w, h) : null;
  if (!found) return null;
  const mask = snapToEdges(found, pixels, w, h), b = maskBox(mask, w, h);
  return b && { mask, w, h, box: { x: (b.x1 + b.x2) / 2 / w, y: (b.y1 + b.y2) / 2 / h, w: (b.x2 - b.x1) / w, h: (b.y2 - b.y1) / h } };
}

export async function traceHighlight(timeline: Timeline, assets: Media[], effect: HighlightEffect, onProgress?: (share: number, note: string) => void, signal?: AbortSignal): Promise<HighlightMask> {
  const [fw, fh] = dimensions(timeline.format), w = Math.round(LOOK * Math.min(1, fw / fh)), h = Math.round(LOOK * Math.min(1, fh / fw)), kw = Math.round(KEEP * Math.min(1, fw / fh)), kh = Math.round(KEEP * Math.min(1, fh / fw));
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const spots = positions(timeline), end = Math.min(effect.start + effect.duration, spots.at(-1)?.end ?? 0);
  const count = Math.max(1, Math.ceil((end - effect.start) * FPS)), frames: string[] = [];
  // The first frame is found from the highlight's own box; after that, from the outline found just before.
  const clampX = (v: number) => Math.min(w, Math.max(0, v)), clampY = (v: number) => Math.min(h, Math.max(0, v));
  let box: [number, number, number, number] = [clampX((effect.x - effect.w / 2) * w), clampY((effect.y - effect.h / 2) * h), clampX((effect.x + effect.w / 2) * w), clampY((effect.y + effect.h / 2) * h)];
  const refinement = effect.points?.map(p => ({ point: [p.x * w, p.y * h] as [number, number], label: p.label })) ?? [];
  const manual = refinement.some(p => p.label === 1);
  let points: [number, number][] | undefined = manual ? refinement.map(p => p.point) : [[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], ...refinement.map(p => p.point)];
  let labels: number[] | undefined = manual ? refinement.map(p => p.label) : [1, ...refinement.map(p => p.label)];
  let previous: Uint8Array | null = null, held = 0;
  /**
   * Each outline is evened out against the frames either side of it: a pixel is kept when at least two of the three
   * have it. That removes the shimmer of an edge that flips back and forth by a pixel from frame to frame, without
   * lagging behind real movement. Frames go out one behind; `undefined` flushes the last.
   */
  const recent: (Uint8Array | null)[] = [];
  const settle = (next: Uint8Array | null | undefined) => {
    if (next !== undefined) recent.push(next);
    const centre = recent.length - (next === undefined ? 1 : 2);
    if (centre < 0) return;
    const [a, b, c] = [recent[centre - 1], recent[centre], next === undefined ? undefined : recent[centre + 1]];
    if (!b) frames.push('');
    else if (!a || !c) frames.push(encodeMask(b));
    else { const out = new Uint8Array(b.length); for (let i = 0; i < out.length; i++) out[i] = a[i] + b[i] + c[i] >= 2 ? 1 : 0; frames.push(encodeMask(out)); }
    if (recent.length > 3) recent.shift();
  };
  let origin: { x: number; y: number } | null = null;
  for (let k = 0; k < count; k++) {
    if (signal?.aborted) throw new DOMException('Tracing stopped.', 'AbortError');
    const t = effect.start + k / FPS, spot = spots.find(p => t >= p.start && t < p.end), asset = spot && assets.find(a => a.id === spot.clip.assetId);
    if (!spot || !asset || asset.kind === 'audio') { frames.push(''); continue; }
    const el = await picture(asset);
    if (el instanceof HTMLVideoElement) await seek(el, Math.min(spot.clip.out - .001, pictureAt(spot.clip, t - spot.start)));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const traceEffects = timeline.effects.filter(e => !(e.kind === 'zoom' && e.follow === effect.id));
    drawFootage(ctx, el, asset, spot.clip, [spot.start, spot.end], traceEffects, t, w, h);
    let pixels = ctx.getImageData(0, 0, w, h).data;
    // A video that has not decoded the new frame yet draws black; give it a moment and draw again.
    if (el instanceof HTMLVideoElement && blank(pixels)) { await new Promise(r => setTimeout(r, 120)); ctx.fillRect(0, 0, w, h); drawFootage(ctx, el, asset, spot.clip, [spot.start, spot.end], traceEffects, t, w, h); pixels = ctx.getImageData(0, 0, w, h).data; }
    // A copy goes to the worker (its buffer moves there); this frame's pixels are still needed to snap the edges.
    // Until the object is found, each frame is asked exactly as the picker asks (the clicks alone, or the box), and
    // read the same way; from then on, from the outline found just before.
    const loading = (share: number) => onProgress?.(0, `Getting the object finder ready… ${Math.round(share * 100)}%`);
    let found: Uint8Array | null;
    if (!previous) {
      const clicks = refinement as Click[];
      const reply = await segment({ width: w, height: h, pixels: pixels.slice(), box: manual ? undefined : box, points: clicks.length ? clicks.map(c => c.point) : undefined, labels: clicks.length ? clicks.map(c => c.label) : undefined }, loading);
      found = reply.present ? firstPick(reply.masks, reply.scores, clicks, box, w, h) : null;
    } else {
      const reply = await segment({ width: w, height: h, pixels: pixels.slice(), box, points, labels }, loading);
      const foreground: [number, number] | undefined = points?.find((_, i) => labels?.[i] !== 0);
      const constraints: { point: [number, number]; label: number }[] | undefined = points?.map((point, i) => ({ point, label: labels?.[i] ?? 1 }));
      found = reply.present ? chooseObjectMask(reply.masks, reply.scores, box, previous, w, h, foreground, constraints) : null;
    }
    if (found) {
      previous = found; held = 0;
      const b: NonNullable<ReturnType<typeof maskBox>> = maskBox(found, w, h)!, padX = (b.x2 - b.x1) * .2 + 6, padY = (b.y2 - b.y1) * .2 + 6;
      box = [clampX(b.x1 - padX), clampY(b.y1 - padY), clampX(b.x2 + padX), clampY(b.y2 + padY)];
      const cx: number = (b.x1 + b.x2) / 2, cy: number = (b.y1 + b.y2) / 2;
      origin ??= { x: cx, y: cy };
      const inside = innerPoint(found, w, h);
      // Keep explicit include/exclude corrections throughout the trace. Shift
      // them with the tracked object's translation instead of dropping them
      // after the first frame and allowing rejected background to return.
      points = [...(inside ? [[inside.x, inside.y] as [number, number]] : []), ...refinement.map(p => [Math.min(w - 1, Math.max(0, p.point[0] + cx - origin!.x)), Math.min(h - 1, Math.max(0, p.point[1] + cy - origin!.y))] as [number, number])];
      labels = [...(inside ? [1] : []), ...refinement.map(p => p.label)];
    }
    // A frame where the object is briefly not found (blur, something passing in front) keeps the last outline for up
    // to half a second rather than flickering off.
    const shown = found ?? (previous && ++held <= FPS / 2 ? previous : null);
    // The stored outline has its edges snapped to the picture; the raw one keeps steering the next frame's prompt.
    settle(shown ? shrink(snapToEdges(shown, pixels, w, h), w, h, kw, kh) : null);
    onProgress?.((k + 1) / count, `Tracing the object… ${k + 1} of ${count} frames`);
  }
  settle(undefined);
  if (!frames.some(Boolean)) throw new Error('The object could not be found inside the highlight. Move the highlight box over it and try again.');
  return { start: effect.start, fps: FPS, w: kw, h: kh, frames };
}
