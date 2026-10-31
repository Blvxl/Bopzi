/**
 * Turns a traced cut-out into the shape that gets painted: the clean, smooth silhouette of a CapCut-style object
 * highlight. The tracer's cut-out is small and raw (blocky edges, pin holes, stray specks); this tidies it once per
 * frame and draws it larger with rounded edges, so the colour sits on the object like a sticker of it.
 */

/** Keeps the object and drops specks: every piece under 6% of the biggest one goes. */
function keepMain(mask: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h), sizes: number[] = [0], queue = new Int32Array(w * h);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    const id = sizes.length; let head = 0, tail = 1, size = 0; queue[0] = s; label[s] = id;
    while (head < tail) {
      const i = queue[head++], x = i % w; size++;
      for (const j of [i - w, i + w, x ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < mask.length && mask[j] && !label[j]) { label[j] = id; queue[tail++] = j; }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes), out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) if (label[i] && sizes[label[i]] >= biggest * .06) out[i] = 1;
  return out;
}

/** Fills holes inside the object (glare, missed pixels) but not gaps open to the outside, like the space between legs. */
function fillHoles(mask: Uint8Array, w: number, h: number) {
  const outside = new Uint8Array(w * h), queue = new Int32Array(w * h); let tail = 0;
  const seed = (i: number) => { if (!mask[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % w;
    if (i >= w) seed(i - w); if (i < w * (h - 1)) seed(i + w); if (x) seed(i - 1); if (x < w - 1) seed(i + 1);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}

/**
 * The cut-out at `scale` times its size with smooth edges: cleaned, softened with a small blur, enlarged with
 * bilinear sampling and cut at the halfway level, which rounds the staircase edges into curves.
 */
export function smoothMask(raw: Uint8Array, w: number, h: number, scale: number) {
  const clean = fillHoles(keepMain(raw, w, h), w, h);
  // A 3 × 3 blur before enlarging rounds corners and closes one-pixel cracks.
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue; sum += clean[yy * w + xx]; n++; }
    soft[y * w + x] = sum / n;
  }
  // `alpha` is the soft version for painting: fully on inside, fading over the last pixel or two of the edge, the way
  // a real cut-out is feathered; `mask` is the hard shape for the outline.
  const W = w * scale, H = h * scale, out = new Uint8Array(W * H), alpha = new Uint8ClampedArray(W * H);
  for (let Y = 0; Y < H; Y++) {
    const fy = Math.min(h - 1, Math.max(0, (Y + .5) / scale - .5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let X = 0; X < W; X++) {
      const fx = Math.min(w - 1, Math.max(0, (X + .5) / scale - .5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const top = soft[y0 * w + x0] * (1 - tx) + soft[y0 * w + x1] * tx, bottom = soft[y1 * w + x0] * (1 - tx) + soft[y1 * w + x1] * tx, v = top * (1 - ty) + bottom * ty;
      out[Y * W + X] = v >= .5 ? 1 : 0; alpha[Y * W + X] = (v - .3) / .4 * 255;
    }
  }
  return { mask: out, alpha, w: W, h: H };
}

/**
 * Snaps a cut-out's edges to the real edges in the picture (a guided filter, He, Sun and Tang 2010, the standard way
 * to refine a segmentation for matting). The model's cut-out is predicted at 256 × 256 and stretched, so its border
 * wanders a few pixels off the object; the filter lets the picture's own brightness edges decide where the border runs.
 * `r` is the window radius in pixels and `eps` how strong an edge has to be to pull the border to it.
 */
export function snapToEdges(mask: Uint8Array, pixels: Uint8ClampedArray, w: number, h: number, r = Math.max(2, Math.round(w / 200)), eps = .002) {
  const n = w * h, I = new Float32Array(n), p = new Float32Array(n);
  for (let i = 0; i < n; i++) { I[i] = (pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114) / 255; p[i] = mask[i]; }
  // Mean over a (2r+1)² window from a summed-area table; windows shrink at the borders.
  const sum = new Float64Array((w + 1) * (h + 1));
  const box = (src: Float32Array) => {
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row; } }
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        out[y * w + x] = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  };
  const II = new Float32Array(n), Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mI = box(I), mp = box(p), mII = box(II), mIp = box(Ip), a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i], c = mIp[i] - mI[i] * mp[i]; a[i] = c / (v + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = box(a), mb = box(b), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = ma[i] * I[i] + mb[i] >= .5 ? 1 : 0;
  return out;
}

/** The band just outside the silhouette, `width` pixels thick: a sticker's white border. */
export function outerBand(mask: Uint8Array, w: number, h: number, width: number) {
  const band = new Uint8Array(w * h); let ring: number[] = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w; for (const j of [i - w, i + w, x ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < mask.length && !mask[j] && !band[j]) { band[j] = 1; ring.push(j); } }
  for (let step = 1; step < width; step++) {
    const next: number[] = [];
    for (const i of ring) { const x = i % w; for (const j of [i - w, i + w, x ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < mask.length && !mask[j] && !band[j]) { band[j] = 1; next.push(j); } }
    ring = next;
  }
  return band;
}

/** How deep inside the shape each pixel is, 0 at the edge to 1 at the deepest point, for a fill that sweeps inward. */
export function depthFromEdge(mask: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h); let deepest = 0;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 1e9 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i]) d[i] = Math.min(d[i], (y ? d[i - w] : 0) + 1, (x ? d[i - 1] : 0) + 1); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (d[i]) { d[i] = Math.min(d[i], (y < h - 1 ? d[i + w] : 0) + 1, (x < w - 1 ? d[i + 1] : 0) + 1); deepest = Math.max(deepest, d[i]); } }
  if (deepest) for (let i = 0; i < d.length; i++) d[i] /= deepest;
  return d;
}

/** A cut-out painted as the highlight will look (colour wash with a light rim), as a picture for a quick preview. */
export function maskPicture(raw: Uint8Array, w: number, h: number, color: string) {
  const smooth = smoothMask(raw, w, h, 1), rim = edgeBand(smooth.mask, w, h, 3), n = parseInt(color.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h }), g = canvas.getContext('2d')!, img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    if (!smooth.mask[i]) continue;
    const edge = rim[i]; img.data.set(edge ? rgb.map(c => Math.round(c + (255 - c) * .55)) : rgb, i * 4); img.data[i * 4 + 3] = edge ? 255 : 140;
  }
  g.putImageData(img, 0, 0); return canvas.toDataURL('image/png');
}

/** The band just inside the silhouette's edge, `width` pixels thick: the bright outline. */
export function edgeBand(mask: Uint8Array, w: number, h: number, width: number) {
  // Distance from the outside, counted in steps, up to `width`.
  let ring = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mask[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w])) ring[i] = 1;
  }
  const band = ring.slice();
  for (let step = 1; step < width; step++) {
    const next = new Uint8Array(w * h);
    for (let i = 0; i < ring.length; i++) if (ring[i]) {
      const x = i % w;
      for (const j of [i - w, i + w, x ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) if (j >= 0 && j < band.length && mask[j] && !band[j]) { band[j] = 1; next[j] = 1; }
    }
    ring = next;
  }
  return band;
}
