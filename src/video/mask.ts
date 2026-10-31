/**
 * Cut-outs of a traced object: one byte per pixel (1 inside, 0 outside), stored as run lengths in base 36, starting
 * with a run of outside pixels. A smooth shape is a few runs per row, so a frame stays around a kilobyte.
 */
export function encodeMask(mask: Uint8Array) {
  const runs: string[] = []; let value = 0, run = 0;
  for (let i = 0; i < mask.length; i++) { const v = mask[i] ? 1 : 0; if (v === value) run++; else { runs.push(run.toString(36)); value = v; run = 1; } }
  if (!runs.length && !value) return '';
  runs.push(run.toString(36));
  return runs.join(',');
}
export function decodeMask(text: string, size: number) {
  const mask = new Uint8Array(size); if (!text) return mask;
  let at = 0, value = 0;
  for (const part of text.split(',')) { const run = parseInt(part, 36) || 0; if (value) mask.fill(1, at, Math.min(size, at + run)); at += run; value ^= 1; }
  return mask;
}

/** The smallest box around the inside pixels, or null for an empty mask. */
export function maskBox(mask: Uint8Array, w: number, h: number) {
  let x1 = w, y1 = h, x2 = -1, y2 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  return x2 < 0 ? null : { x1, y1, x2: x2 + 1, y2: y2 + 1 };
}
export function maskArea(mask: Uint8Array) { let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i]; return n; }

/** One foreground seed plus negative seeds beyond the object box. */
export function objectPrompts(box: [number, number, number, number], w: number, h: number, foreground?: [number, number][], inputLabels?: number[]) {
  const [x1, y1, x2, y2] = box, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const points: [number, number][] = foreground?.length ? [...foreground] : [[cx, cy]];
  const labels = points.map((_, i) => inputLabels?.[i] === 0 ? 0 : 1);
  const outside: [number, number][] = [];
  if (x1 > 1) outside.push([Math.max(0, x1 - 4), cy]);
  if (x2 < w - 1) outside.push([Math.min(w - 1, x2 + 4), cy]);
  if (y1 > 1) outside.push([cx, Math.max(0, y1 - 4)]);
  if (y2 < h - 1) outside.push([cx, Math.min(h - 1, y2 + 4)]);
  for (const p of outside) { points.push(p); labels.push(0); }
  return { points, labels };
}

/** Keep only connected pieces touched by foreground clicks. This removes
 * detached plants, stools and speckles without filling the gaps between legs. */
export function seededComponents(mask: Uint8Array, w: number, h: number, points: [number, number][]) {
  const result = new Uint8Array(w * h), queue = new Int32Array(w * h);
  for (const [px, py] of points) {
    const sx = Math.max(0, Math.min(w - 1, Math.floor(px))), sy = Math.max(0, Math.min(h - 1, Math.floor(py))), seed = sy * w + sx;
    if (!mask[seed] || result[seed]) continue;
    let head = 0, tail = 1; queue[0] = seed; result[seed] = 1;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !result[j]) { result[j] = 1; queue[tail++] = j; }
      }
    }
  }
  return result;
}

/** Choose the object, never the large scene-shaped mask surrounding it. */
export function chooseObjectMask(masks: Uint8Array[], scores: number[], box: [number, number, number, number], previous: Uint8Array | null, w: number, h: number, point?: [number, number], constraints?: { point: [number, number]; label: number }[]): Uint8Array | null {
  const [x1, y1, x2, y2] = box.map(Math.round), before = previous ? maskArea(previous) : 0;
  let best: Uint8Array | null = null, bestScore = -Infinity;
  for (let i = 0; i < masks.length; i++) {
    const source = masks[i];
    if (source.length !== w * h) continue;
    const area = maskArea(source);
    // A scene-sized mask can be the complement of the requested object. Only
    // consider that complement if it independently fits the requested box.
    const variants = [source];
    if (area > w * h * .5 && (x2 - x1) * (y2 - y1) < w * h * .7) variants.push(source.map(v => v ? 0 : 1));
    for (const m of variants) {
      const clipped = new Uint8Array(w * h); let inside = 0, total = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const j = y * w + x; if (!m[j]) continue;
        total++; if (x >= x1 && x < x2 && y >= y1 && y < y2) { clipped[j] = 1; inside++; }
      }
      if (!total || inside / total < .6 || inside < w * h * .0005 || inside > (x2 - x1) * (y2 - y1) * .97) continue;
      if (point && !clipped[Math.min(h - 1, Math.max(0, Math.floor(point[1]))) * w + Math.min(w - 1, Math.max(0, Math.floor(point[0])))]) continue;
      const seeds = constraints?.filter(c => c.label === 1).map(c => c.point) ?? (point ? [point] : []);
      const clean = seeds.length ? seededComponents(clipped, w, h, seeds) : clipped;
      if (constraints?.some(c => !!clean[Math.min(h - 1, Math.max(0, Math.floor(c.point[1]))) * w + Math.min(w - 1, Math.max(0, Math.floor(c.point[0])))] !== !!c.label)) continue;
      inside = maskArea(clean);
      if (inside < w * h * .0005) continue;
      if (previous && (inside > before * 2.5 || inside < before * .4)) continue;
      const score = (previous ? iou(previous, clean) : .3 * inside / total) + .15 * (scores[i] ?? 0);
      if (score > bestScore) { bestScore = score; best = clean; }
    }
  }
  return best;
}

/** Repair a saved background selection within the user's object box. */
export function invertMaskInBox(text: string, w: number, h: number, box: [number, number, number, number]) {
  if (!text) return '';
  const source = decodeMask(text, w * h), result = new Uint8Array(w * h);
  const [x1, y1, x2, y2] = box;
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(h, Math.ceil(y2)); y++) for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x2)); x++) result[y * w + x] = source[y * w + x] ? 0 : 1;
  return encodeMask(result);
}

/** Old projects may contain the surrounding scene as foreground. Repair it at
 * draw time too: fixing only new inference leaves those saved frames unchanged.
 * A moving object may leave its original box, so only invert scene-sized masks
 * that also occupy most of the image border, never an ordinary off-centre mask.
 */
export function highlightObjectPixels(text: string, w: number, h: number, box: [number, number, number, number]) {
  const pixels = decodeMask(text, w * h), [x1, y1, x2, y2] = box;
  let total = 0, outside = 0, border = 0, borderCount = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = pixels[y * w + x];
    total += v;
    if (x < x1 || x >= x2 || y < y1 || y >= y2) outside += v;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border += v; borderCount++; }
  }
  if (total > w * h * .25 && outside > total * .5 && border > borderCount * .4) {
    return decodeMask(invertMaskInBox(text, w, h, box), w * h);
  }
  return pixels;
}
export function iou(a: Uint8Array, b: Uint8Array) {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) { both += a[i] & b[i]; either += a[i] | b[i]; }
  return either ? both / either : 0;
}
/**
 * The inside pixel farthest from the edge: always on the object, even when the object is thin or curved and its middle
 * is not (a stick held at an angle, a ring). Two-pass chamfer distance.
 */
export function innerPoint(mask: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h), far = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? far : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue;
    const up = y ? d[i - w] : 0, left = x ? d[i - 1] : 0;
    d[i] = Math.min(d[i], up + 1, left + 1, y && x ? d[i - w - 1] + 1.4 : 1.4, y && x < w - 1 ? d[i - w + 1] + 1.4 : 1.4);
  }
  let best = -1, bx = 0, by = 0;
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    const down = y < h - 1 ? d[i + w] : 0, right = x < w - 1 ? d[i + 1] : 0;
    d[i] = Math.min(d[i], down + 1, right + 1, y < h - 1 && x < w - 1 ? d[i + w + 1] + 1.4 : 1.4, y < h - 1 && x ? d[i + w - 1] + 1.4 : 1.4);
    if (d[i] > best) { best = d[i]; bx = x; by = y; }
  }
  return best < 0 ? null : { x: bx + .5, y: by + .5 };
}
