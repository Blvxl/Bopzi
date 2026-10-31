/**
 * A second video on top of the footage: a facecam in a corner, the bottom half of a "game top / facecam bottom" Short,
 * one side of a before/after, or a green-screen meme keyed over the gameplay. `layout` says where it goes: "pip" is a
 * free box (x/y its centre, size its width, all shares of the frame, its height following the picture); "split-*" is
 * that side of the frame, `size` deep, and the main footage is reframed into the rest so nothing is hidden behind it;
 * "full" covers the frame (usually with a chroma key). `crop` picks part of the source (shares of it), `chromaKey`
 * makes a colour transparent. It plays from `in` (source seconds) at normal speed for `duration`.
 *
 * The preview and the export share the pixel boxes worked out here, rounded the way FFmpeg needs them (whole numbers,
 * even sizes), so the picture lands on the same pixels in both. Footage in the preview is scaled from these boxes.
 */
export type PipLayout = 'pip' | 'split-top' | 'split-bottom' | 'split-left' | 'split-right' | 'full';
export const PIP_LAYOUTS: { id: PipLayout; label: string }[] = [{ id: 'pip', label: 'Corner' }, { id: 'split-top', label: 'Top half' }, { id: 'split-bottom', label: 'Bottom half' }, { id: 'split-left', label: 'Left half' }, { id: 'split-right', label: 'Right half' }, { id: 'full', label: 'Full frame' }];
export type ChromaKey = { color: string; similarity: number; blend: number };
export type Crop = { x: number; y: number; w: number; h: number };
export type VideoOverlay = { id: string; assetId: string; start: number; in: number; duration: number; volume: number; layout: PipLayout; x: number; y: number; size: number; crop?: Crop; chromaKey?: ChromaKey };
export type Box = { x: number; y: number; w: number; h: number };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** A fresh facecam in the bottom-right corner, from `start`, as long as the source allows. */
export function newVideoOverlay(asset: { id: string; kind: string; duration: number }, start: number, room: number, id: string): VideoOverlay {
  return { id, assetId: asset.id, start, in: 0, duration: Math.max(.1, Math.min(room, asset.kind === 'image' ? 5 : asset.duration)), volume: asset.kind === 'video' ? 1 : 0, layout: 'pip', x: .78, y: .78, size: .34 };
}
export const isSplit = (o: Pick<VideoOverlay, 'layout'>) => o.layout.startsWith('split-');
export const videoOverlaysAt = (list: VideoOverlay[], t: number) => list.filter(o => t >= o.start && t < o.start + o.duration);

/** The area a split layout takes, as shares of the frame. */
function splitShare(o: Pick<VideoOverlay, 'layout' | 'size'>): Box {
  const s = o.size;
  return o.layout === 'split-top' ? { x: 0, y: 0, w: 1, h: s } : o.layout === 'split-bottom' ? { x: 0, y: 1 - s, w: 1, h: s } : o.layout === 'split-left' ? { x: 0, y: 0, w: s, h: 1 } : o.layout === 'split-right' ? { x: 1 - s, y: 0, w: s, h: 1 } : { x: 0, y: 0, w: 1, h: 1 };
}
/** A share box as whole pixels in a frame, with even sizes; one touching the far edge stays flush with it, so rounding never leaves a sliver. */
function pixels(b: Box, W: number, H: number): Box { const w = Math.min(W, even(b.w * W)), h = Math.min(H, even(b.h * H)); return { x: b.x + b.w > .999 ? W - w : Math.round(b.x * W), y: b.y + b.h > .999 ? H - h : Math.round(b.y * H), w, h }; }

/**
 * Where the overlay goes in a W×H frame (`dest`) and which part of its source fills it (`src`, in the source's own
 * pixels). Split and full layouts fill their area, trimming the crop's middle to the area's shape.
 */
export function pipGeometry(o: VideoOverlay, source: { width: number; height: number }, W: number, H: number) {
  const sw = source.width || 16, sh = source.height || 9, c = o.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const fit = (n: number, room: number) => Math.max(2, Math.min(even(n), Math.floor(room / 2) * 2)), x = Math.min(sw - 2, Math.round(c.x * sw)), y = Math.min(sh - 2, Math.round(c.y * sh));
  let src = { x, y, w: fit(c.w * sw, sw - x), h: fit(c.h * sh, sh - y) };
  if (o.layout === 'pip') { const w = even(o.size * W), h = even(w * src.h / src.w); return { dest: { x: Math.round(o.x * W - w / 2), y: Math.round(o.y * H - h / 2), w, h }, src }; }
  const dest = pixels(splitShare(o), W, H), aspect = dest.w / dest.h;
  // Cover: the crop's middle, cut to the area's shape.
  if (src.w / src.h > aspect) { const w = even(src.h * aspect); src = { ...src, x: src.x + Math.round((src.w - w) / 2), w: Math.min(src.w, w) }; }
  else { const h = even(src.w / aspect); src = { ...src, y: src.y + Math.round((src.h - h) / 2), h: Math.min(src.h, h) }; }
  return { dest, src };
}

/** Where the main footage is framed while a split overlay is on: the rest of the frame. One split at a time. */
export function footageArea(list: VideoOverlay[], t: number, W: number, H: number): Box | undefined {
  const split = videoOverlaysAt(list, t).find(isSplit);
  return split && footageAreaFor(split, W, H);
}
export function footageAreaFor(o: VideoOverlay, W: number, H: number): Box {
  const s = splitShare(o);
  return pixels(o.layout === 'split-top' ? { x: 0, y: s.h, w: 1, h: 1 - s.h } : o.layout === 'split-bottom' ? { x: 0, y: 0, w: 1, h: 1 - s.h } : o.layout === 'split-left' ? { x: s.w, y: 0, w: 1 - s.w, h: 1 } : { x: 0, y: 0, w: 1 - s.w, h: 1 }, W, H);
}

/** FFmpeg's colorkey, pixel for pixel: how far each colour is from the key, opaque past similarity, soft across blend. */
export function keyPixels(data: Uint8ClampedArray, key: ChromaKey) {
  const n = parseInt(key.color.slice(1), 16), kr = n >> 16 & 255, kg = n >> 8 & 255, kb = n & 255;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - kr, dg = data[i + 1] - kg, db = data[i + 2] - kb, diff = Math.sqrt((dr * dr + dg * dg + db * db) / (255 * 255 * 3));
    const a = key.blend > .0001 ? Math.min(1, Math.max(0, (diff - key.similarity) / key.blend)) : diff > key.similarity ? 1 : 0;
    data[i + 3] = Math.round(data[i + 3] * a);
  }
}
/** Each keyed overlay's last result, reused while its frame and settings stay the same (the paused preview redraws constantly). */
const keyed = new Map<string, { canvas: HTMLCanvasElement; stamp: string }>();
/**
 * Draws one overlay into a frame of w×h pixels, `W`×`H` being the export size the boxes are worked out for. A keyed
 * overlay goes through a scratch canvas at its drawn size, so its colour is taken out after scaling, as in the export.
 */
export function drawVideoOverlay(ctx: CanvasRenderingContext2D, o: VideoOverlay, picture: CanvasImageSource, source: { width: number; height: number }, w: number, h: number, W: number, H: number) {
  const { dest, src } = pipGeometry(o, source, W, H), k = w / W;
  // A proxy or a decoded image can have other pixel sizes than the file; the box is a share of whatever is drawn.
  const pw = picture instanceof HTMLVideoElement ? picture.videoWidth : picture instanceof HTMLImageElement ? picture.naturalWidth : source.width, ps = (pw || source.width) / (source.width || 1);
  const d = { x: dest.x * k, y: dest.y * k, w: dest.w * k, h: dest.h * k };
  if (!o.chromaKey) { ctx.drawImage(picture, src.x * ps, src.y * ps, src.w * ps, src.h * ps, d.x, d.y, d.w, d.h); return; }
  const cw = Math.max(1, Math.round(d.w)), ch = Math.max(1, Math.round(d.h));
  const stamp = JSON.stringify([picture instanceof HTMLVideoElement ? picture.currentTime : 0, (picture as HTMLImageElement).src ?? '', cw, ch, src, o.chromaKey]);
  let entry = keyed.get(o.id);
  if (!entry) keyed.set(o.id, entry = { canvas: document.createElement('canvas'), stamp: '' });
  if (entry.stamp !== stamp) {
    const c = entry.canvas; if (c.width !== cw || c.height !== ch) Object.assign(c, { width: cw, height: ch });
    const g = c.getContext('2d', { willReadFrequently: true })!; g.clearRect(0, 0, cw, ch); g.drawImage(picture, src.x * ps, src.y * ps, src.w * ps, src.h * ps, 0, 0, cw, ch);
    const img = g.getImageData(0, 0, cw, ch); keyPixels(img.data, o.chromaKey); g.putImageData(img, 0, 0); entry.stamp = stamp;
  }
  ctx.drawImage(entry.canvas, d.x, d.y, d.w, d.h);
}

/**
 * The export's version: each overlay as an extra input, cropped and scaled to its box, keyed, delayed to its start and
 * laid over the joined footage while it lasts. `inputs` are the FFmpeg input indices, in list order. Returns the graph
 * lines and the label of the result.
 */
export function pipGraph(list: { item: VideoOverlay; input: number; source: { width: number; height: number } }[], W: number, H: number, video: string) {
  const lines: string[] = []; let current = video;
  list.forEach(({ item: o, input, source }, i) => {
    const { dest, src } = pipGeometry(o, source, W, H), key = o.chromaKey ? `,colorkey=0x${o.chromaKey.color.slice(1)}:${o.chromaKey.similarity}:${o.chromaKey.blend}` : '';
    lines.push(`[${input}:v]fps=30,crop=${src.w}:${src.h}:${src.x}:${src.y},scale=${dest.w}:${dest.h},setsar=1,format=rgba${key},setpts=PTS-STARTPTS+${o.start.toFixed(3)}/TB[pip${i}]`);
    lines.push(`[${current}][pip${i}]overlay=${dest.x}:${dest.y}:eof_action=pass:enable='between(t,${o.start.toFixed(3)},${(o.start + o.duration).toFixed(3)})'[withpip${i}]`);
    current = `withpip${i}`;
  });
  return { lines, output: current };
}

/**
 * The export's footage framing for one clip: a filter that frames the picture to fill the frame, and while a split
 * overlay is on, into the rest of the frame instead (switching with `enable`, t being time within the clip). Spans
 * are the split overlays' times relative to the clip's start.
 */
export function framingFilter(zoom: number, focusX: number, W: number, H: number, splits: { area: Box; from: number; to: number }[]) {
  const fill = (w: number, h: number) => `scale=${Math.ceil(w * zoom / 2) * 2}:${Math.ceil(h * zoom / 2) * 2}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-ow)*${focusX}:(ih-oh)/2,setsar=1`;
  if (!splits.length) return fill(W, H);
  const n = splits.length + 1, parts = [`split=${n}${Array.from({ length: n }, (_, i) => `[frame${i}]`).join('')}`, `[frame0]${fill(W, H)}[framed0]`];
  splits.forEach(({ area, from, to }, i) => parts.push(`[frame${i + 1}]${fill(area.w, area.h)},pad=${W}:${H}:${area.x}:${area.y}:color=0x0b0a09[framed${i + 1}]`));
  let current = 'framed0';
  splits.forEach(({ from, to }, i) => { const last = i === splits.length - 1; parts.push(`[${current}][framed${i + 1}]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'${last ? '' : `[split${i}]`}`); current = `split${i}`; });
  return parts.join(';');
}
