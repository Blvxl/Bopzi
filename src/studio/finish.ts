/**
 * The finishing pass a GFX artist does by hand after the render, run in the browser on each new take:
 * light sharpening, an S-curve for contrast, a little more colour, a soft vignette and fine grain.
 * Together they take off the even, plastic sheen that makes a generated image read as AI.
 * It runs once, when a take arrives; changes made to a take afterwards are not finished again, so nothing piles up.
 */
const SHARPEN = 0.45; // how much of the detail lost to a 3 × 3 blur is added back
const CURVE = 0.38; // how far the tones move towards a smoothstep S-curve
const SATURATION = 1.08;
const VIGNETTE = 0.16; // how much the corners darken
const GRAIN = 4.5; // ± levels of monochrome noise

/** A small, fast, seeded random source, so a take always gets the same grain. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function finish(canvas: HTMLCanvasElement, seed = 1) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const { width: w, height: h } = canvas;
  const image = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(image.data);
  const out = image.data;

  const curve = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    curve[v] = Math.round((x + CURVE * (x * x * (3 - 2 * x) - x)) * 255);
  }
  const noise = random(seed);
  const cx = w / 2, cy = h / 2;

  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w, row = y * w, down = (y < h - 1 ? y + 1 : y) * w;
    const dy = (y - cy) / cy;
    for (let x = 0; x < w; x++) {
      const left = x > 0 ? x - 1 : x, right = x < w - 1 ? x + 1 : x;
      const i = (row + x) * 4;
      const rgb = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        // Unsharp mask against the average of the 3 × 3 neighbourhood.
        const blur = (src[(up + left) * 4 + c] + src[(up + x) * 4 + c] + src[(up + right) * 4 + c]
          + src[(row + left) * 4 + c] + src[i + c] + src[(row + right) * 4 + c]
          + src[(down + left) * 4 + c] + src[(down + x) * 4 + c] + src[(down + right) * 4 + c]) / 9;
        const sharp = src[i + c] + SHARPEN * (src[i + c] - blur);
        rgb[c] = curve[sharp < 0 ? 0 : sharp > 255 ? 255 : sharp | 0];
      }
      const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
      const dx = (x - cx) / cx;
      // An elliptical falloff that starts a little past the middle and is strongest in the corners.
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
      const edge = r < 0.5 ? 0 : ((r - 0.5) / 0.5) ** 2;
      const shade = 1 - VIGNETTE * edge;
      const grain = (noise() - 0.5) * 2 * GRAIN;
      for (let c = 0; c < 3; c++) out[i + c] = (l + (rgb[c] - l) * SATURATION) * shade + grain;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
