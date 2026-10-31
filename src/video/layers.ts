import { visibleTimeline } from './editing';
import { applyTransform, transformAt, type Transform } from './clip-motion';
import { face } from './faces';
import { captionActive, captionAt, captionStyleFor, captionText, captionWords, drawCaption, drawTitle, overlayBox, positions, titleBox, titleOpacity, type CaptionStyle, type Media, type Overlay, type Timeline, type Title } from './model';
import { decodeMask, highlightObjectPixels } from './mask';
import { depthFromEdge, edgeBand, outerBand, smoothMask } from './maskLook';
import { titleMotion, type TitleMotion } from './motion';
import { barAt, cameraAt, counterAt, flashAt, highlightAt, popAt, type BarEffect, type CounterEffect, type HighlightEffect, type HighlightMask } from './motion';
import { followed } from './follow';
import { drawOverlay, loadOverlayPicture, overlayPicture } from './overlays';
import { blursAt } from './blur';
import { pipGeometry, videoOverlaysAt } from './pip';

/**
 * Everything drawn above the footage at one moment: highlights, logos, titles, counters, captions and flashes, in that
 * order. The preview and the export both call this, so an animation looks the same in the editor and in the MP4.
 */
type Visible = ({ kind: 'highlight'; item: HighlightEffect; alpha: number; scale: number; /** Where in the traced outline's frames, for a traced one. */ frame?: number; /** Seconds since it appeared, for its reveal and pulse. */ age: number } | { kind: 'overlay'; item: Overlay; alpha: number } | { kind: 'title'; item: Title; alpha: number; scale: number; anim?: TitleMotion; /** The traced highlight whose object is drawn back over this title. */ subject?: HighlightEffect } | { kind: 'bar'; item: BarEffect; alpha: number; value: number } | { kind: 'counter'; item: CounterEffect; text: string; final: string; alpha: number; scale: number } | { kind: 'caption'; item: Title; style: CaptionStyle; active: ReturnType<typeof captionActive> } | { kind: 'flash'; color: string; alpha: number }) & { motion?: Transform; camera?: { scale: number; x: number; y: number } };

export function layersAt(timeline: Timeline, t: number): Visible[] {
  timeline = visibleTimeline(timeline);
  // Items that follow a traced object are placed where it is now; from here on they draw, select and animate as usual.
  const fx = timeline.effects, spots = positions(timeline), spot = spots.find(p => t >= p.start && t < p.end), span = spot ? [spot.start, spot.end] as const : undefined, at = <T extends { start: number; x: number; y: number; follow?: string }>(i: T) => followed(i, fx, t);
  timeline = { ...timeline, titles: timeline.titles.map(at), overlays: timeline.overlays.map(at), effects: fx.map(e => e.kind === 'counter' || e.kind === 'bar' ? at(e) : e) };
  const out: Visible[] = [], titles: Visible[] = [];
  for (const e of timeline.effects) if (e.kind === 'highlight') { const h = highlightAt(e, t); if (h && h.alpha > .003) out.push({ kind: 'highlight', item: e, ...h, age: t - e.start, ...(e.mask ? { frame: (t - e.mask.start) * e.mask.fps } : {}) }); }
  for (const o of timeline.overlays) { const alpha = titleOpacity(o, t); if (alpha) out.push({ kind: 'overlay', item: o, alpha }); }
  for (const title of timeline.titles) {
    const subject = title.behind ? timeline.effects.find((e): e is HighlightEffect => e.id === title.behind && e.kind === 'highlight' && !!e.mask) : undefined, extra = subject ? { subject } : {};
    if (title.animation === 'pop') { const p = popAt(title.start, title.duration, t); if (p.alpha) titles.push({ kind: 'title', item: title, alpha: p.alpha, scale: p.scale, ...extra }); }
    else if (title.animation === 'fade' || title.animation === 'none') { const alpha = titleOpacity(title, t); if (alpha) titles.push({ kind: 'title', item: title, alpha, scale: 1, ...extra }); }
    // Typewriter, slide, bounce, shake and glitch: a move worked out for this moment (titleMotion in motion.ts).
    else { const m = titleMotion(title.animation, title.start, title.duration, t, title.text.length); if (m && m.alpha > .003) titles.push({ kind: 'title', item: title, alpha: m.alpha, scale: m.scale, anim: m, ...extra }); }
  }
  // Text behind the player goes first, straight onto the footage, so the object cut back out over it covers only it.
  out.unshift(...titles.filter(behind)); out.push(...titles.filter(v => !behind(v)));
  for (const e of timeline.effects) if (e.kind === 'bar') { const b = barAt(e, t); if (b && b.alpha > .003) out.push({ kind: 'bar', item: e, ...b }); }
  for (const e of timeline.effects) if (e.kind === 'counter') { const c = counterAt(e, t); if (c?.alpha) out.push({ kind: 'counter', item: e, ...c }); }
  const caption = captionAt(timeline, t);
  if (caption) { const item = captionText(timeline, caption); out.push({ kind: 'caption', item, style: captionStyleFor(timeline, caption), active: captionActive(caption, captionWords(item.text), t) }); }
  for (const e of timeline.effects) if (e.kind === 'flash') { const alpha = flashAt(e, t); if (alpha > .003) out.push({ kind: 'flash', color: e.color, alpha }); }
  // A flash-cut transition is a white flash peaking on the cut, drawn here so the export gets it with everything else.
  spots.forEach(({ clip, start, end }, i) => {
    const prev = spots[i - 1];
    if (clip.transition?.kind !== 'flash' || !prev) return;
    const half = Math.min(clip.transition.duration / 2, (end - start) / 2, (prev.end - prev.start) / 2), u = Math.abs(t - start);
    if (u < half) out.push({ kind: 'flash', color: '#ffffff', alpha: (1 - u / half) ** 1.5 });
  });
  return out.map(v => {
    if (!('item' in v)) return v;
    const keys = timeline.layerSettings?.[v.item.id]?.keyframes;
    const motion = keys?.length ? transformAt(keys, t - v.item.start) : undefined;
    if (v.kind !== 'highlight' || !v.item.mask || !fx.some(e => e.kind === 'zoom' && e.follow === v.item.id)) return { ...v, ...(motion ? { motion, ...('alpha' in v ? { alpha: v.alpha * Math.max(0, Math.min(1, motion.opacity)) } : {}) } : {}) };
    // The object mask is traced without its own follow zoom. Map that camera framing onto the live framing so the
    // cut-out and its flash stay attached to the subject in both the preview and the rendered layer sequence.
    const base = cameraAt(fx.filter(e => !(e.kind === 'zoom' && e.follow === v.item.id)), t, span), live = cameraAt(fx, t, span), scale = live.zoom / base.zoom;
    const x = live.fx * (1 - live.zoom) + live.zoom * live.dx - scale * (base.fx * (1 - base.zoom) + base.zoom * base.dx);
    const y = live.fy * (1 - live.zoom) + live.zoom * live.dy - scale * (base.fy * (1 - base.zoom) + base.zoom * base.dy);
    return { ...v, camera: { scale, x, y }, ...(motion ? { motion, ...('alpha' in v ? { alpha: v.alpha * Math.max(0, Math.min(1, motion.opacity)) } : {}) } : {}) };
  });
}

/** A title with a traced object drawn back over it: the text behind the player. */
const behind = (v: Visible): v is Extract<Visible, { kind: 'title' }> & { subject: HighlightEffect } => v.kind === 'title' && !!v.subject;

/**
 * A short key for what the layers look like at a moment. Two moments with the same key draw the same picture, so the
 * export renders each distinct picture once and holds it, instead of one picture per frame.
 */
export function layersKey(visible: Visible[]) {
  const r = (n: number) => Math.round(n * 200) / 200;
  return JSON.stringify([visible.map(v => [v.motion, v.camera]), visible.map(v => v.kind === 'flash' ? ['f', v.color, r(v.alpha)] : v.kind === 'caption' ? ['c', v.item.id, v.item.text, v.item.font, v.item.color, v.item.size, v.item.x, v.item.y, v.style.active, v.style.activeColor, v.style.stroke, v.style.glow, v.style.shadow, v.active?.index ?? -1, r(v.active?.progress ?? 0)] : v.kind === 'counter' ? ['n', v.item, v.text, r(v.alpha), r(v.scale)] : v.kind === 'bar' ? ['b', v.item, r(v.alpha), Math.round(v.value * 20) / 20] : v.kind === 'title' ? ['t', v.item, r(v.alpha), r(v.scale), v.anim ? [r(v.anim.dx), r(v.anim.dy), r(v.anim.rot), v.anim.chars ?? -1, r(v.anim.glitch)] : 0] : v.kind === 'highlight' ? ['h', v.item.id, v.item.color, v.item.style, v.item.shape, v.item.x, v.item.y, v.item.w, v.item.h, v.item.look, v.item.lookColor, v.item.endColor, v.item.changeAt, v.item.every, r(v.alpha), r(v.scale), v.frame === undefined ? -1 : r(v.frame), v.item.label ?? '', v.item.pulse || v.item.reveal && v.item.reveal !== 'pop' && v.age < REVEAL || v.item.look ? r(v.age) : -1] : ['o', v.item, r(v.alpha)])]);
}

function counterLayout(ctx: CanvasRenderingContext2D, e: CounterEffect, height: number, text: string) {
  const f = face(e.font), px = Math.round(height * e.size);
  ctx.font = `${f.weight} ${px}px ${f.family}, Arial, sans-serif`;
  const digit = Math.max(...'0123456789'.split('').map(c => ctx.measureText(c).width));
  const advance = (c: string) => /[0-9]/.test(c) ? digit : ctx.measureText(c).width;
  const width = (value: string) => [...value].reduce((sum, c) => sum + advance(c), 0);
  const number = text.slice(e.prefix.length, e.suffix ? -e.suffix.length : undefined);
  const values = [e.from, e.to].map(value => counterAt({ ...e, from: value, to: value, entrance: 'none' }, e.start)?.text ?? text);
  const numberWidth = Math.max(...values.map(value => width(value.slice(e.prefix.length, e.suffix ? -e.suffix.length : undefined))));
  const prefixWidth = width(e.prefix), suffixWidth = width(e.suffix), w = prefixWidth + numberWidth + suffixWidth;
  return { px, w, advance, runs: [{ text: e.prefix, x: -w / 2 }, { text: number, x: -w / 2 + prefixWidth + numberWidth - width(number) }, { text: e.suffix, x: w / 2 - suffixWidth }] };
}
/** Fixed-width digit cells and independent labels prevent horizontal jitter while numbers change. */
function drawCounter(ctx: CanvasRenderingContext2D, v: Extract<Visible, { kind: 'counter' }>, width: number, height: number) {
  const e = v.item, f = face(e.font), px = Math.round(height * e.size), cx = width * e.x, cy = height * e.y;
  ctx.save(); ctx.globalAlpha = v.alpha; ctx.translate(cx, cy); ctx.scale(v.scale, v.scale);
  const layout = counterLayout(ctx, e, height, v.text);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b0a09'; ctx.lineWidth = px * .14; ctx.fillStyle = e.color;
  for (const run of layout.runs) { let x = run.x; for (const c of run.text) { const advance = layout.advance(c); ctx.strokeText(c, x + advance / 2, 0); ctx.fillText(c, x + advance / 2, 0); x += advance; } }
  ctx.restore();
}

/**
 * A progress bar: a dark rounded track with a black rim, the fill in its colour with a soft shine along the top, and
 * the label and percentage inside. The fill keeps the bar's round ends, even when nearly empty.
 */
function drawBar(ctx: CanvasRenderingContext2D, v: Extract<Visible, { kind: 'bar' }>, width: number, height: number) {
  const e = v.item, w = e.w * width, h = e.h * height, x = e.x * width - w / 2, y = e.y * height - h / 2, rim = Math.max(2, h * .12);
  ctx.save(); ctx.globalAlpha = v.alpha;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = e.back; ctx.fill(); ctx.lineWidth = rim; ctx.strokeStyle = '#0b0a09'; ctx.stroke();
  const inner = h - rim, share = Math.min(1, Math.max(0, v.value / 100)), fill = (w - rim) * share;
  if (fill > .5) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x + rim / 2, y + rim / 2, w - rim, inner, inner / 2); ctx.clip();
    ctx.beginPath(); ctx.roundRect(x + rim / 2 + Math.min(0, fill - inner), y + rim / 2, Math.max(fill, inner), inner, inner / 2); ctx.fillStyle = e.color; ctx.fill();
    ctx.globalAlpha = v.alpha * .28; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + rim / 2 + inner * .12, rim / 2 + fill, inner * .28);
    ctx.restore();
  }
  const text = [e.label, e.showValue ? `${Math.round(v.value)}%` : ''].filter(Boolean).join(' ');
  if (text) {
    const f = face('luckiest'), px = Math.round(h * .62);
    ctx.font = `${f.weight} ${px}px ${f.family}, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = px * .2; ctx.strokeStyle = '#0b0a09'; ctx.strokeText(text, x + w / 2, y + h / 2 + px * .05); ctx.fillStyle = '#ffffff'; ctx.fillText(text, x + w / 2, y + h / 2 + px * .05);
  }
  ctx.restore();
}

function highlightPath(ctx: CanvasRenderingContext2D, e: HighlightEffect, width: number, height: number, scale: number) {
  const cx = e.x * width, cy = e.y * height, rx = e.w * width / 2 * scale, ry = e.h * height / 2 * scale;
  if (e.shape === 'ellipse') ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  else ctx.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, Math.min(rx, ry) * .2);
}
/**
 * One traced frame as two small pictures in the highlight's colour: the object's filled shape and its rim. Drawn
 * scaled up with smoothing, the rim becomes a soft bright edge. Made once per frame and colour.
 */
type Piece = {
  fill: HTMLCanvasElement; rim: HTMLCanvasElement; /** A white border just outside the shape, for the sticker look. */ border: HTMLCanvasElement;
  /** The soft fill's coverage and each pixel's depth inside the shape, for the fill that sweeps in from the edges. */ alpha: Uint8ClampedArray; depth: Float32Array; w: number; h: number;
  /** The shape's box and centre as shares of the frame, for the draw-on sweep and the label. */ box: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number };
} | null;
const pieces = new WeakMap<HighlightMask, Map<string, Piece>>();
function piece(mask: HighlightMask, index: number, color: string, box: [number, number, number, number]): Piece {
  let made = pieces.get(mask); if (!made) pieces.set(mask, made = new Map());
  const key = `${index}|${color}|${box.join(',')}`; if (made.has(key)) return made.get(key)!;
  const text = mask.frames[index], { w, h } = mask;
  let result: Piece = null;
  if (text) {
    const n = parseInt(color.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
    // Cleaned and drawn at three times the traced size with rounded edges, so the colour reads as the object's own
    // silhouette instead of blocky pixels (maskLook.ts).
    // About 1280 pixels wide whatever the stored size, enough for smooth edges without slowing the preview.
    const scale = Math.max(1, Math.round(1280 / w));
    // Brush strokes are deliberate: preserve erased holes and painted fragments
    // rather than running automatic hole filling or background inversion again.
    const edited = mask.edited ? decodeMask(text, w * h) : null;
    const smooth = edited ? { mask: edited, alpha: Uint8ClampedArray.from(edited, v => v * 255), w, h } : smoothMask(highlightObjectPixels(text, w, h, box), w, h, scale), rim = edgeBand(smooth.mask, smooth.w, smooth.h, Math.max(2, mask.edited ? 1 : scale + 1));
    // The rim is a lighter shade of the colour, the way a cut-out highlight catches the light at its edge.
    const light = rgb.map(c => Math.round(c + (255 - c) * .55));
    const paint = (keep: ArrayLike<number>, tone: number[], soft = false) => {
      const c = Object.assign(document.createElement('canvas'), { width: smooth.w, height: smooth.h }), g = c.getContext('2d')!, img = g.createImageData(smooth.w, smooth.h);
      for (let i = 0; i < keep.length; i++) if (keep[i]) { img.data.set(tone, i * 4); img.data[i * 4 + 3] = soft ? keep[i] : 255; }
      g.putImageData(img, 0, 0); return c;
    };
    let x1 = smooth.w, y1 = smooth.h, x2 = 0, y2 = 0, sx = 0, sy = 0, n2 = 0;
    for (let i = 0; i < smooth.mask.length; i++) if (smooth.mask[i]) { const x = i % smooth.w, y = (i - x) / smooth.w; x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); sx += x; sy += y; n2++; }
    result = n2 ? {
      // The fill is the soft version, so its border is feathered like a real cut-out instead of a hard pixel edge.
      fill: paint(smooth.alpha, rgb, true), rim: paint(rim, light), border: paint(outerBand(smooth.mask, smooth.w, smooth.h, Math.max(3, scale * 3)), [255, 255, 255]),
      alpha: smooth.alpha, depth: depthFromEdge(smooth.mask, smooth.w, smooth.h), w: smooth.w, h: smooth.h,
      box: { x1: x1 / smooth.w, y1: y1 / smooth.h, x2: x2 / smooth.w, y2: y2 / smooth.h, cx: sx / n2 / smooth.w, cy: sy / n2 / smooth.h },
    } : null;
  }
  made.set(key, result); return result;
}
let shade: HTMLCanvasElement | null = null;
/** A traced highlight follows the object's own shape, blending between traced frames so it moves smoothly at 30 fps. */
function drawTraced(ctx: CanvasRenderingContext2D, v: Extract<Visible, { kind: 'highlight' }>, width: number, height: number) {
  const e = v.item, mask = e.mask!, f = Math.min(mask.frames.length - 1, Math.max(0, v.frame ?? 0)), i = Math.floor(f), mix = f - i, tint = e.look === 'cycle' && v.age >= (e.changeAt ?? 1) ? mixColour(e.color, e.endColor ?? '#ffbf47', Math.min(1, (v.age - (e.changeAt ?? 1)) / .15)) : e.color;
  const box: [number, number, number, number] = [(e.x - e.w / 2) * mask.w, (e.y - e.h / 2) * mask.h, (e.x + e.w / 2) * mask.w, (e.y + e.h / 2) * mask.h];
  const parts = [[piece(mask, i, tint, box), 1 - mix], [i + 1 < mask.frames.length ? piece(mask, i + 1, tint, box) : null, mix]] as const;
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // How far into its reveal (0 to 1) and how bright its pulse is right now (0 to 1).
  const reveal = e.reveal && e.reveal !== 'pop' ? Math.min(1, v.age / REVEAL) : 1, eased = 1 - (1 - reveal) ** 3;
  const glow = e.pulse ? .5 + .5 * Math.sin(2 * Math.PI * v.age / PULSE - Math.PI / 2) : 0;
  if (e.style === 'spotlight') {
    shade ??= document.createElement('canvas'); if (shade.width !== width || shade.height !== height) Object.assign(shade, { width, height });
    const s = shade.getContext('2d')!; s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, width, height); s.fillStyle = 'rgba(0,0,0,.6)'; s.fillRect(0, 0, width, height);
    s.globalCompositeOperation = 'destination-out';
    for (const [p, a] of parts) if (p && a > .01) { s.globalAlpha = a; s.drawImage(p.fill, 0, 0, width, height); }
    s.globalAlpha = 1; ctx.globalAlpha = v.alpha * eased; ctx.drawImage(shade, 0, 0);
  }
  // Like CapCut's object highlight, the penguin look: the object washed in the colour, with a bright outline that
  // glows just slightly. "Outline" keeps the wash faint so the object shows through; "spotlight" and "sticker" only
  // outline it. A sticker is the object with a thick white border and a drop shadow, as if cut out and stuck on.
  const fill = e.style === 'tint' ? .55 : e.style === 'outline' ? .15 : 0;
  // An invisible tracker shows only its label.
  for (const [p, a] of parts) if (p && a > .01 && e.style !== 'none') {
    if (fill) { ctx.shadowBlur = 0; ctx.globalAlpha = v.alpha * a * fill * (e.reveal === 'fade' ? 1 : eased); ctx.drawImage(e.reveal === 'fade' && reveal < 1 ? sweep(p, reveal) : p.fill, 0, 0, width, height); }
    ctx.save();
    if (e.reveal === 'draw' && reveal < 1) {
      // The outline draws itself on: a wedge sweeping clockwise from twelve o'clock round the object's centre.
      const cx = p.box.cx * width, cy = p.box.cy * height, r = Math.hypot(width, height);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * eased); ctx.closePath(); ctx.clip();
    }
    ctx.globalAlpha = v.alpha * a;
    if (e.style === 'sticker') {
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = height * .012; ctx.shadowOffsetY = height * .006;
      ctx.drawImage(p.border, 0, 0, width, height);
    } else if (e.style !== 'tint') {
      ctx.globalAlpha = v.alpha * a * (e.pulse ? .7 + .3 * glow : 1);
      ctx.shadowColor = e.color; ctx.shadowBlur = height * (.008 + .022 * glow); ctx.drawImage(p.rim, 0, 0, width, height);
    }
    ctx.restore();
  }
  if (e.look === 'flash' || e.look === 'sweep') for (const [p, a] of parts) if (p && a > .01) {
    lookCanvas ??= document.createElement('canvas'); if (lookCanvas.width !== width || lookCanvas.height !== height) Object.assign(lookCanvas, { width, height });
    const g = lookCanvas.getContext('2d')!; g.clearRect(0, 0, width, height);
    if (e.look === 'flash') {
      const d = Math.min(e.lookDuration ?? .2, e.duration), u = v.age, alpha = u < 0 ? 0 : u < .05 ? u / .05 : Math.max(0, 1 - (u - .05) / Math.max(.01, d - .05)) ** 2;
      if (alpha > .003) { g.fillStyle = e.lookColor ?? '#ffffff'; g.globalAlpha = v.alpha * a * alpha; g.fillRect(0, 0, width, height); }
    } else {
      const period = e.every ?? 1, phase = (v.age % period) / period, cx = (phase * 1.8 - .4) * width, grad = g.createLinearGradient(cx - width * .12, 0, cx + width * .12, height);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(.5, 'rgba(255,255,255,.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, width, height);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(p.fill, 0, 0, width, height); g.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1; ctx.drawImage(lookCanvas, 0, 0);
  }
  // The label follows the object, blended between traced frames like the shape.
  const [a, b] = parts, pa = a[0], pb = b[0] && b[1] > .01 ? b[0] : null;
  if (e.label && pa) {
    const mixBox = (k: 'x1' | 'x2' | 'y1' | 'cx') => pb ? pa.box[k] * (1 - mix) + pb.box[k] * mix : pa.box[k];
    drawLabel(ctx, e.label, e.color, mixBox('cx') * width, mixBox('y1') * height, width, height, v.alpha * eased);
  }
  ctx.restore();
}
let lookCanvas: HTMLCanvasElement | null = null;
function mixColour(a: string, b: string, p: number) {
  const x = Number.parseInt(a.slice(1), 16), y = Number.parseInt(b.slice(1), 16), c = [16, 8, 0].map(s => Math.round(((x >> s) & 255) * (1 - p) + ((y >> s) & 255) * p));
  return `#${c.map(n => n.toString(16).padStart(2, '0')).join('')}`;
}
const REVEAL = .6, PULSE = .8;
let sweepCanvas: HTMLCanvasElement | null = null;
/** The fill partway through sweeping in from the edges: pixels near the edge first, the middle last, softly. */
function sweep(p: NonNullable<Piece>, share: number) {
  sweepCanvas ??= document.createElement('canvas'); if (sweepCanvas.width !== p.w || sweepCanvas.height !== p.h) Object.assign(sweepCanvas, { width: p.w, height: p.h });
  const g = sweepCanvas.getContext('2d')!, img = g.createImageData(p.w, p.h), src = p.fill.getContext('2d')!.getImageData(0, 0, p.w, p.h).data, reach = share * 1.25;
  for (let i = 0; i < p.depth.length; i++) {
    if (!p.alpha[i]) continue;
    const on = Math.min(1, Math.max(0, (reach - p.depth[i]) / .25));
    img.data[i * 4] = src[i * 4]; img.data[i * 4 + 1] = src[i * 4 + 1]; img.data[i * 4 + 2] = src[i * 4 + 2]; img.data[i * 4 + 3] = p.alpha[i] * on;
  }
  g.putImageData(img, 0, 0); return sweepCanvas;
}
/** A rounded tag above the object with a little arrow pointing down at it, kept inside the frame. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, color: string, x: number, top: number, width: number, height: number, alpha: number) {
  const f = face('luckiest'), px = Math.round(height * .045), pad = px * .45, arrow = px * .35;
  ctx.save(); ctx.globalAlpha = alpha; ctx.font = `${f.weight} ${px}px ${f.family}, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + pad * 2, h = px + pad * 1.4;
  const cx = Math.min(width - w / 2 - 8, Math.max(w / 2 + 8, x)), bottom = Math.max(h + arrow + 8, top - height * .015), y = bottom - arrow - h / 2;
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = px * .3; ctx.shadowOffsetY = px * .08; ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(cx - w / 2, y - h / 2, w, h, h / 2);
  const tip = Math.min(cx + w / 2 - h / 2, Math.max(cx - w / 2 + h / 2, x));
  ctx.moveTo(tip - arrow, y + h / 2 - 1); ctx.lineTo(tip, bottom); ctx.lineTo(tip + arrow, y + h / 2 - 1); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Dark text on a light colour, white on a dark one.
  const n = parseInt(color.slice(1), 16), light = (n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114 > 150;
  ctx.fillStyle = light ? '#0b0a09' : '#ffffff'; ctx.fillText(text, cx, y + px * .05);
  ctx.restore();
}
/** Outline: a glowing ring. Tint: the area washed in the colour. Spotlight: everything else darkened. */
function drawHighlight(ctx: CanvasRenderingContext2D, v: Extract<Visible, { kind: 'highlight' }>, width: number, height: number) {
  if (v.item.mask) return drawTraced(ctx, v, width, height);
  if (v.item.style === 'none') { if (v.item.label) drawLabel(ctx, v.item.label, v.item.color, v.item.x * width, (v.item.y - v.item.h / 2 * v.scale) * height, width, height, v.alpha); return; }
  const e = v.item, sticker = e.style === 'sticker', line = Math.max(2, height * (e.style === 'outline' ? .009 : sticker ? .012 : .005));
  const reveal = e.reveal && e.reveal !== 'pop' ? Math.min(1, v.age / REVEAL) : 1, eased = 1 - (1 - reveal) ** 3;
  const glow = e.pulse ? .5 + .5 * Math.sin(2 * Math.PI * v.age / PULSE - Math.PI / 2) : 0;
  ctx.save(); ctx.globalAlpha = v.alpha;
  if (e.style === 'spotlight') {
    ctx.beginPath(); ctx.rect(0, 0, width, height); highlightPath(ctx, e, width, height, v.scale);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.globalAlpha = v.alpha * eased; ctx.fill('evenodd');
  }
  ctx.beginPath(); highlightPath(ctx, e, width, height, v.scale);
  ctx.fillStyle = e.color; ctx.globalAlpha = v.alpha * eased * (e.style === 'tint' ? .38 : e.style === 'outline' ? .1 : 0); ctx.fill();
  // Drawing on: the ring's line runs round from where it starts until it closes.
  if (e.reveal === 'draw' && reveal < 1) { const around = Math.PI * (e.w * width + e.h * height); ctx.setLineDash([around * eased, around]); }
  ctx.globalAlpha = v.alpha * (e.pulse ? .7 + .3 * glow : 1); ctx.lineWidth = line;
  if (sticker) { ctx.strokeStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = height * .012; ctx.shadowOffsetY = height * .006; ctx.stroke(); }
  else { ctx.strokeStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = height * (.03 + .03 * glow); ctx.stroke(); ctx.shadowBlur = 0; ctx.stroke(); }
  ctx.restore();
  if (e.label) drawLabel(ctx, e.label, e.color, e.x * width, (e.y - e.h / 2 * v.scale) * height, width, height, v.alpha * eased);
}

/** Selection follows the same visibility, stacking and animated geometry as drawing. */
export function layerBoxes(ctx: CanvasRenderingContext2D, timeline: Timeline, assets: Media[], time: number, width: number, height: number) {
  // Blurred areas sit in the footage, under every layer, so they come first: anything drawn over one is picked before it.
  const blurs = blursAt(timeline.effects.filter(e => !timeline.layerSettings?.[e.id]?.hidden), time).map(e => ({ id: e.id, x: (e.x - e.w / 2) * width, y: (e.y - e.h / 2) * height, w: e.w * width, h: e.h * height }));
  // Videos on top come next: over the footage and its blurs, under everything drawn (pip.ts).
  const videos = videoOverlaysAt(timeline.videoOverlays.filter(o => !timeline.layerSettings?.[o.id]?.hidden), time).flatMap(o => { const a = assets.find(a => a.id === o.assetId); return a ? [{ id: o.id, ...pipGeometry(o, a, width, height).dest }] : []; });
  return [...blurs, ...videos, ...layersAt(timeline, time).flatMap(v => {
    if (v.kind === 'flash') return [];
    let b: { x: number; y: number; w: number; h: number };
    const item = v.item;
    if (v.kind === 'counter') { ctx.save(); const l = counterLayout(ctx, v.item, height, v.text); ctx.restore(); const w = (l.w + l.px * .3) * v.scale, h = l.px * 1.3 * v.scale; b = { x: item.x * width - w / 2, y: item.y * height - h / 2, w, h }; }
    else if (v.kind === 'overlay') { const a = assets.find(a => a.id === v.item.assetId); b = overlayBox(v.item, width, height, a ? a.width / a.height : 1); }
    else if (v.kind === 'highlight' || v.kind === 'bar') { const s = v.kind === 'highlight' ? v.scale : 1, w = v.item.w * width * s, h = v.item.h * height * s; b = { x: v.item.x * width - w / 2, y: v.item.y * height - h / 2, w, h }; }
    else { b = titleBox(ctx, v.item, width, height, face(v.item.font)); const scale = v.kind === 'title' ? v.scale : 1; b = { x: item.x * width + (b.x - item.x * width) * scale, y: item.y * height + (b.y - item.y * height) * scale, w: b.w * scale, h: b.h * scale }; }
    if (v.motion) {
      const tr = v.motion, angle = tr.rotation * Math.PI / 180, cx = item.x * width, cy = item.y * height;
      const points = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => ({ x: cx + tr.x * width + ((x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle)) * tr.scale, y: cy + tr.y * height + ((x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle)) * tr.scale }));
      const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y)); b = { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
    }
    return [{ id: item.id, ...b }];
  })];
}

/**
 * For export: the layers over the footage as distinct pictures, each with how long it holds, at 30 frames a second.
 * A static logo costs one picture for the whole video; a counter costs one per frame while it rolls. With text behind
 * the player there are two more sequences, in the order FFmpeg stacks them: the behind titles, and the object's matte
 * (white where it is) that cuts it out of the footage to go back over them. Everything else is `frames`, on top.
 */
export async function renderLayerFrames(timeline: Timeline, assets: Media[], width: number, height: number, length: number, onProgress?: (share: number) => void) {
  const pictures = new Map<string, HTMLImageElement>();
  for (const o of timeline.overlays) if (o.assetId && !pictures.has(o.assetId)) pictures.set(o.assetId, await loadOverlayPicture(o, assets));
  for (const o of timeline.overlays) if (o.source === 'icon') await loadOverlayPicture(o, assets);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d')!;
  const sequence = () => {
    const frames: Blob[] = [], holds: number[] = []; let last = '';
    return { frames, holds, async add(key: string, draw: () => void) {
      if (key === last && holds.length) { holds[holds.length - 1] += 1 / 30; return; }
      ctx.clearRect(0, 0, width, height); draw();
      frames.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('An animation frame could not be drawn.')), 'image/png')));
      holds.push(1 / 30); last = key;
    } };
  };
  const top = sequence(), below = sequence(), matte = sequence(), subjects = visibleTimeline(timeline).titles.some(t => t.behind);
  const count = Math.ceil(length * 30);
  for (let f = 0; f < count; f++) {
    const t = f / 30, visible = layersAt(timeline, t), under = visible.filter(behind);
    await top.add(layersKey(visible.filter(v => !behind(v))), () => drawLayers(ctx, visible.filter(v => !behind(v)), width, height, id => pictures.get(id)));
    if (subjects) {
      await below.add(layersKey(under), () => drawLayers(ctx, under, width, height, id => pictures.get(id)));
      const shapes = subjectsOf(under);
      await matte.add(JSON.stringify(shapes.map(e => [e.id, Math.round(maskFrame(e, t) * 200) / 200])), () => { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, width, height); const m = subjectMatte(shapes, t, width, height); if (m) ctx.drawImage(m, 0, 0); });
    }
    if (f % 15 === 0) onProgress?.(f / count);
  }
  return { frames: top.frames, holds: top.holds, ...(subjects ? { below: { frames: below.frames, holds: below.holds }, matte: { frames: matte.frames, holds: matte.holds } } : {}) };
}

/** The distinct traced highlights the behind titles on screen go behind. */
const subjectsOf = (under: Visible[]) => [...new Map(under.filter(behind).map(v => [v.subject.id, v.subject])).values()];
/** Where in its traced frames a highlight is at a moment, clamped like drawTraced. */
const maskFrame = (e: HighlightEffect, t: number) => Math.min(e.mask!.frames.length - 1, Math.max(0, (t - e.mask!.start) * e.mask!.fps));
let matteCanvas: HTMLCanvasElement | null = null, matteOne: HTMLCanvasElement | null = null;
/**
 * The objects' shapes at a moment, white on transparent, with the same soft edge as the highlight's own fill and blended
 * between traced frames the same way. Added, not stacked, so a shape halfway between two frames stays fully solid.
 */
function subjectMatte(subjects: HighlightEffect[], t: number, width: number, height: number) {
  if (!subjects.length) return null;
  matteCanvas ??= document.createElement('canvas'); if (matteCanvas.width !== width || matteCanvas.height !== height) Object.assign(matteCanvas, { width, height });
  const g = matteCanvas.getContext('2d')!; g.clearRect(0, 0, width, height); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  matteOne ??= document.createElement('canvas'); if (matteOne.width !== width || matteOne.height !== height) Object.assign(matteOne, { width, height });
  const one = matteOne, o = one.getContext('2d')!; o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  for (const e of subjects) {
    const mask = e.mask!, f = maskFrame(e, t), i = Math.floor(f), mix = f - i;
    const box: [number, number, number, number] = [(e.x - e.w / 2) * mask.w, (e.y - e.h / 2) * mask.h, (e.x + e.w / 2) * mask.w, (e.y + e.h / 2) * mask.h];
    o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, width, height); o.globalCompositeOperation = 'lighter';
    for (const [p, a] of [[piece(mask, i, '#ffffff', box), 1 - mix], [i + 1 < mask.frames.length ? piece(mask, i + 1, '#ffffff', box) : null, mix]] as const) if (p && a > .01) { o.globalAlpha = a; o.drawImage(p.fill, 0, 0, width, height); }
    g.drawImage(one, 0, 0);
  }
  return matteCanvas;
}
let footageCopy: HTMLCanvasElement | null = null;
/**
 * Everything above the footage already on `ctx`, for the preview and the AI's frame check: titles set behind a traced
 * object go on first, then that object is cut out of the footage underneath and laid back over them, then the rest.
 * The export stacks the same three pictures in FFmpeg (renderLayerFrames, render.ts), so the two always match.
 */
export function drawScene(ctx: CanvasRenderingContext2D, timeline: Timeline, t: number, width: number, height: number, images: (assetId: string) => HTMLImageElement | undefined) {
  const visible = layersAt(timeline, t), under = visible.filter(behind);
  if (under.length) {
    footageCopy ??= document.createElement('canvas'); if (footageCopy.width !== width || footageCopy.height !== height) Object.assign(footageCopy, { width, height });
    const g = footageCopy.getContext('2d')!; g.globalCompositeOperation = 'copy'; g.drawImage(ctx.canvas, 0, 0, width, height);
    drawLayers(ctx, under, width, height, images);
    const matte = subjectMatte(subjectsOf(under), t, width, height);
    if (matte) { g.globalCompositeOperation = 'destination-in'; g.drawImage(matte, 0, 0); g.globalCompositeOperation = 'source-over'; ctx.drawImage(footageCopy, 0, 0, width, height); }
  }
  drawLayers(ctx, visible.filter(v => !behind(v)), width, height, images);
}
export function drawLayers(ctx: CanvasRenderingContext2D, visible: Visible[], width: number, height: number, images: (assetId: string) => HTMLImageElement | undefined) {
  for (const v of visible) {
    ctx.save();
    if (v.camera) { ctx.translate(v.camera.x * width, v.camera.y * height); ctx.scale(v.camera.scale, v.camera.scale); }
    if (v.motion && 'item' in v) { applyTransform(ctx, { ...v.motion, opacity: 1 }, width, height, v.item.x, v.item.y); if (v.kind === 'caption') ctx.globalAlpha *= Math.max(0, Math.min(1, v.motion.opacity)); }
    if (v.kind === 'highlight') drawHighlight(ctx, v, width, height);
    else if (v.kind === 'overlay') { ctx.save(); ctx.globalAlpha = v.alpha; drawOverlay(ctx, v.item, width, height, overlayPicture(v.item, images)); ctx.restore(); }
    else if (v.kind === 'title') { ctx.save(); ctx.globalAlpha = v.alpha; drawTitle(ctx, v.item, width, height, face(v.item.font), v.scale, v.anim); ctx.restore(); }
    else if (v.kind === 'counter') drawCounter(ctx, v, width, height);
    else if (v.kind === 'bar') drawBar(ctx, v, width, height);
    else if (v.kind === 'caption') drawCaption(ctx, v.item, v.style, v.active, width, height, face(v.item.font));
    else { ctx.save(); ctx.globalAlpha = v.alpha; ctx.fillStyle = v.color; ctx.fillRect(0, 0, width, height); ctx.restore(); }
    ctx.restore();
  }
}
