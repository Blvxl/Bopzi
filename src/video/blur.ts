import type { BlurEffect, Effect } from './motion';

/**
 * Blur or pixelate part of the footage: usernames, chat, a face. Both the preview and the export work on the finished
 * footage frame (after zooms and transitions), under titles and captions, with the same box: the preview blurs with the
 * canvas's Gaussian blur and the export with FFmpeg's two-pass box blur of the same radius, which look alike; for
 * pixelation both shrink the box to the same few blocks and blow it back up without smoothing, which matches exactly.
 */
export const blursAt = (effects: Effect[], t: number) => effects.filter((e): e is BlurEffect => e.kind === 'blur' && t >= e.start && t < e.start + e.duration);

/** The box in pixels, whole and inside the frame (FFmpeg crops need even, in-range numbers). */
export function blurBox(e: BlurEffect, w: number, h: number) {
  const bw = Math.max(2, Math.round(e.w * w / 2) * 2), bh = Math.max(2, Math.round(e.h * h / 2) * 2);
  const x = Math.round(Math.min(w - bw, Math.max(0, e.x * w - bw / 2)) / 2) * 2, y = Math.round(Math.min(h - bh, Math.max(0, e.y * h - bh / 2)) / 2) * 2;
  return { x, y, w: Math.min(bw, w), h: Math.min(bh, h) };
}
/** Blur radius in pixels for a frame of this height, and how big a pixelation block is. */
export const blurRadius = (e: BlurEffect, h: number) => Math.max(2, Math.round(h * .03 * e.strength * 2));
export const blockSize = (e: BlurEffect, h: number) => Math.max(4, Math.round(h * (.012 + .05 * e.strength)));

/** Over what the canvas already shows: each active blur box blurred or pixelated in place. */
export function drawBlurs(ctx: CanvasRenderingContext2D, effects: Effect[], t: number, w: number, h: number) {
  const active = blursAt(effects, t); if (!active.length) return;
  for (const e of active) {
    const b = blurBox(e, w, h), copy = Object.assign(document.createElement('canvas'), { width: b.w, height: b.h }), c = copy.getContext('2d')!;
    c.drawImage(ctx.canvas, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    if (e.style === 'pixelate') {
      const n = blockSize(e, h), tw = Math.max(1, Math.round(b.w / n)), th = Math.max(1, Math.round(b.h / n));
      const small = Object.assign(document.createElement('canvas'), { width: tw, height: th }); small.getContext('2d')!.drawImage(copy, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(small, 0, 0, tw, th, b.x, b.y, b.w, b.h);
    } else {
      // Blurring the copy with its own edges extended, so the box does not darken towards its border.
      const r = blurRadius(e, h); ctx.filter = `blur(${r}px)`;
      ctx.drawImage(copy, b.x - r, b.y - r, b.w + 2 * r, b.h + 2 * r);
    }
    ctx.restore();
  }
}

/**
 * The export's version, for the joined footage (t is timeline time): one filter chain per blur, each cropping its box
 * out of the frame, blurring or pixelating it and laying it back while the blur lasts. Returns the graph lines and the
 * label of the result.
 */
export function blurGraph(effects: Effect[], w: number, h: number, input: string): { lines: string[]; output: string } {
  const blurs = effects.filter((e): e is BlurEffect => e.kind === 'blur');
  const lines: string[] = []; let current = input;
  blurs.forEach((e, i) => {
    const b = blurBox(e, w, h), enable = `between(t,${e.start.toFixed(3)},${(e.start + e.duration).toFixed(3)})`;
    const look = e.style === 'pixelate'
      ? (() => { const n = blockSize(e, h), tw = Math.max(1, Math.round(b.w / n)), th = Math.max(1, Math.round(b.h / n)); return `scale=${tw}:${th}:flags=area,scale=${b.w}:${b.h}:flags=neighbor`; })()
      : `boxblur=luma_radius=${Math.min(blurRadius(e, h), Math.floor(Math.min(b.w, b.h) / 2) - 1)}:luma_power=2:chroma_radius=${Math.max(1, Math.min(Math.round(blurRadius(e, h) / 2), Math.floor(Math.min(b.w, b.h) / 4) - 1))}:chroma_power=2`;
    lines.push(`[${current}]split[blurbase${i}][blursrc${i}]`, `[blursrc${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},${look}[blurbox${i}]`, `[blurbase${i}][blurbox${i}]overlay=${b.x}:${b.y}:enable='${enable}'[blurred${i}]`);
    current = `blurred${i}`;
  });
  return { lines, output: current };
}
