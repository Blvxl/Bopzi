import { decodeMask, encodeMask } from './mask';
import type { HighlightMask } from './motion';
export type BrushPoint = { x: number; y: number };
/** Paint capsules between samples so fast drags leave no gaps. Frame undefined
 * explicitly applies a screen-space correction to the entire highlight. */
export function brushMask(mask: HighlightMask, stroke: BrushPoint[], radius: number, paint: boolean, frame?: number): HighlightMask {
  if (!stroke.length) return mask;
  const { w, h } = mask, r = Math.max(.5, radius * w);
  const frames = mask.frames.map((text, index) => {
    if (frame !== undefined && index !== frame) return text;
    const pixels = decodeMask(text, w * h);
    for (let k = 0; k < stroke.length; k++) {
      const a = stroke[Math.max(0, k - 1)], b = stroke[k], ax = a.x * w, ay = a.y * h, bx = b.x * w, by = b.y * h, dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y < Math.min(h, Math.ceil(Math.max(ay, by) + r)); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x < Math.min(w, Math.ceil(Math.max(ax, bx) + r)); x++) {
        const t = length ? Math.max(0, Math.min(1, ((x + .5 - ax) * dx + (y + .5 - ay) * dy) / length)) : 0;
        if ((x + .5 - ax - t * dx) ** 2 + (y + .5 - ay - t * dy) ** 2 <= r * r) pixels[y * w + x] = paint ? 1 : 0;
      }
    }
    return encodeMask(pixels);
  });
  return { ...mask, frames, edited: true };
}
