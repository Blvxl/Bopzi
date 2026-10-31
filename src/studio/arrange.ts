import Konva from 'konva';
import { CANVAS_H, CANVAS_W, type Shadow, type TextLayer, type Layer, type ImageLayer } from '@/lib/types';
import { loadAsset } from '@/lib/assets';
import { arrowPreview, type ArrowShape } from './callouts';
import { makeTextLayer } from './factory';
import { getCenter, layerSize, originForCenter, textProps } from './geometry';
import { HELPER } from './imageRoute';

/** Reference-guided callouts rendered as ordinary editable layers, then reviewed at tile size. */

import { parsePlan, parseReview, type Box, type Point, type Plan, type Callout } from './arrangePlan';
export { parsePlan } from './arrangePlan';
export type { Plan } from './arrangePlan';
type Rect = { x: number; y: number; w: number; h: number };
export async function smallCopy(image: Blob) {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * bitmap.height) / bitmap.width);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88);
}

/** Asks what is in the picture. On your own computer Codex is asked directly; otherwise through the helper. */
export type MatchedReference = { name: string; sourceUrl: string; imageUrl: string; image: string };
export type ArrangeInput = { image: string; scene: string; mode: 'suggest' | 'existing'; composition?: string; reference?: string; referenceId?: number; references?: MatchedReference[]; context: Record<string, unknown> };
async function askArrangement(input: ArrangeInput & { phase?: 'review' | 'match'; previews?: string[] }, signal?: AbortSignal) {
  const read = async (response: Response, what: string) => {
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.error || what);
    return body as { answer?: string; question?: string; images?: string[] };
  };
  const own = await read(await fetch('/api/thumbnail/arrange', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, signal, body: JSON.stringify(input) }), 'The studio could not be reached. Try again in a moment.');
  let answer = own.answer;
  if (answer === undefined && own.question) {
    const helped = await read(
      await fetch(`${HELPER}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ question: own.question, images: own.images ?? [input.image] }) }).catch(() => {
        throw new Error('Connect your ChatGPT plan first: the Bopzi helper is not answering.');
      }),
      'The helper could not look at the image.',
    );
    answer = helped.answer;
  }
  return answer;
}
export async function requestPlan(input: ArrangeInput, signal?: AbortSignal, progress?: (status: string) => void): Promise<Plan> {
  progress?.('Finding similar Roblox thumbnails');
  try {
    const answer = await askArrangement({ ...input, phase: 'match' }, signal);
    if (typeof answer !== 'string') throw new Error('No scene match');
    const match = JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1));
    if (typeof match.query !== 'string' || match.query.trim().length < 2) throw new Error('No search query');
    const response = await fetch('/api/thumbnail/arrange', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, signal, body: JSON.stringify({ phase: 'references', query: match.query.slice(0, 60) }) });
    if (!response.ok) throw new Error('Reference search unavailable');
    const found = await response.json();
    input.references = found.references ?? [];
    input.context.referenceSearch = { query: match.query, composition: match.composition, warning: found.warning, candidates: input.references?.length ?? 0 };
  } catch (e) {
    if (signal?.aborted) throw e;
    input.references = [];
    input.context.referenceSearch = { warning: 'Automatic matching unavailable; using your scene and selected reference.' };
  }
  progress?.('Designing from matched references');
  const plan = parsePlan(await askArrangement(input, signal));
  if (!plan || plan.layouts.length !== 3) throw new Error('No complete arrangement came back. Try again.');
  if (input.mode === 'suggest' && plan.layouts.some(l => l.callouts === undefined)) throw new Error('The layout designer did not return complete callout styles. Try again.');
  return plan;
}
export async function reviewTakes(input: ArrangeInput, plan: Plan, takes: Take[], signal?: AbortSignal) {
  return parseReview(await askArrangement({ ...input, phase: 'review', previews: takes.map(t => t.preview), context: { ...input.context, plan, candidates: takes.map(t => ({ name: t.name, text: [t.label, ...t.marks, ...(t.texts ?? [])].filter(Boolean).map(t => t!.text), readable: t.readable, issues: t.issues })) } }, signal), takes.length);
}

// ---------- reading the picture itself

const GW = 192, GH = 108;
type Pixels = { r: Float32Array; g: Float32Array; b: Float32Array; edge: Float32Array };

/** A small copy of the picture as numbers: its colours, and how busy each spot is. */
export function readPixels(image: CanvasImageSource): Pixels {
  const canvas = document.createElement('canvas');
  canvas.width = GW;
  canvas.height = GH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, GW, GH);
  const { data } = ctx.getImageData(0, 0, GW, GH);
  const n = GW * GH;
  const px: Pixels = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), edge: new Float32Array(n) };
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px.r[i] = data[i * 4];
    px.g[i] = data[i * 4 + 1];
    px.b[i] = data[i * 4 + 2];
    luma[i] = 0.299 * px.r[i] + 0.587 * px.g[i] + 0.114 * px.b[i];
  }
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x;
    px.edge[i] = Math.min(1, (Math.abs(luma[i + 1] - luma[i - 1]) + Math.abs(luma[i + GW] - luma[i - GW])) / 90);
  }
  return px;
}

const rectOf = (b: Box): Rect => ({ x: b[0] * CANVAS_W, y: b[1] * CANVAS_H, w: b[2] * CANVAS_W, h: b[3] * CANVAS_H });
const covered = (a: Rect, b: Rect) => (Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))) / Math.max(1, a.w * a.h);
export function layerRect(l: Layer): Rect {
  if (l.type === 'text' && !l.text.includes('\n')) {
    const probe = new Konva.Text(textProps(l));
    if (typeof probe.measureSize === 'function') {
      const ink = probe.measureSize(l.uppercase ? l.text.toUpperCase() : l.text), sample = probe.measureSize('M');
      const baseline = l.fontSize * l.lineHeight / 2 + (Konva.legacyTextRendering ? 0 : (sample.fontBoundingBoxAscent - sample.fontBoundingBoxDescent) / 2);
      const left = -ink.actualBoundingBoxLeft, top = baseline - ink.actualBoundingBoxAscent;
      const w = probe.width() + ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight - ink.width, h = ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent;
      probe.destroy();
      const angle = l.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
      const corners = [[left,top],[left+w,top],[left,top+h],[left+w,top+h]].map(([x,y]) => ({ x: l.x + x*l.scaleX*cos - y*l.scaleY*sin, y: l.y + x*l.scaleX*sin + y*l.scaleY*cos }));
      const pad = l.strokeWidth * Math.max(Math.abs(l.scaleX),Math.abs(l.scaleY));
      const x = Math.min(...corners.map(p => p.x)) - pad, y = Math.min(...corners.map(p => p.y)) - pad;
      return { x, y, w: Math.max(...corners.map(p => p.x)) + pad - x + Math.abs(l.shadow.offsetX), h: Math.max(...corners.map(p => p.y)) + pad - y + Math.abs(l.shadow.offsetY) };
    }
    probe.destroy();
  }
  const { w, h } = layerSize(l), a = l.rotation * Math.PI / 180, c = getCenter(l);
  const pad = l.type === 'text' ? l.strokeWidth * 2 + Math.abs(l.shadow.offsetY) : 0;
  const width = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)) + pad, height = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)) + pad;
  return { x: c.x - width / 2, y: c.y - height / 2, w: width, h: height };
}
export function describeLayer(l: Layer) {
  const r = layerRect(l);
  return { id: l.id, type: l.type === 'image' && l.arrow ? 'arrow' : l.type, text: l.type === 'text' ? l.text : undefined, pinned: l.locked, box: [r.x / CANVAS_W, r.y / CANVAS_H, r.w / CANVAS_W, r.h / CANVAS_H], center: [(r.x+r.w/2) / CANVAS_W, (r.y+r.h/2) / CANVAS_H], rotation: l.rotation };
}

function originForInkCenter(layer: Layer, center: { x: number; y: number }) {
  const ink = layerRect(layer), cell = getCenter(layer);
  return originForCenter(layer, { x: center.x - (ink.x+ink.w/2-cell.x), y: center.y - (ink.y+ink.h/2-cell.y) });
}

function insidePolygon(x: number, y: number, polygon: Point[]) {
  let inside = false;
  for (let i=0, j=polygon.length-1; i<polygon.length; j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function detailOverlap(at: Rect, plan: Plan) {
  const outlines = plan.protectedOutlines ?? [];
  const boxes = outlines.map(p => ({ x: Math.min(...p.map(q=>q[0]))*CANVAS_W, y: Math.min(...p.map(q=>q[1]))*CANVAS_H, w: (Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])))*CANVAS_W, h: (Math.max(...p.map(q=>q[1]))-Math.min(...p.map(q=>q[1])))*CANVAS_H }));
  // A supplied silhouette replaces only its matching broad box, never smaller hand/fixed-layer boxes.
  const critical = [...plan.faces.map(rectOf), ...plan.protected.map(rectOf).filter(b => !boxes.some(p => covered(b,p)>.8 && covered(p,b)>.8))];
  let blocked = critical.reduce((sum,b)=>sum+covered(at,b)+covered(b,at),0);
  for (const polygon of outlines) {
    let hit=0;
    for (let y=0;y<12;y++) for(let x=0;x<12;x++) if(insidePolygon((at.x+(x+.5)*at.w/12)/CANVAS_W,(at.y+(y+.5)*at.h/12)/CANVAS_H,polygon)) hit++;
    blocked += hit/144;
  }
  return blocked;
}

// ---------- the label

const hard = (y: number): Shadow => ({ enabled: true, color: '#000000', blur: 0, offsetX: 0, offsetY: y, opacity: 1 });
/** Capital letters are about this share of the font size tall, in both fonts used here. */
const CAP = 0.72;

/** Full rotated text bounds, including its outline and shadow. */
function bounds(label: TextLayer) { const r = layerRect(label); return { w: r.w, h: r.h }; }

/** Safety adjustment stays near the chosen semantic anchor; it never searches the whole image. */
function safeSpot(size: { w: number; h: number }, center: Point, plan: Plan) {
  const x = center[0] * CANVAS_W - size.w / 2, y = center[1] * CANVAS_H - size.h / 2;
  const candidates = [{ x, y }];
  for (const d of [24, 48, 72, 96]) for (const [dx, dy] of [[0,-d],[0,d],[-d,0],[d,0],[-d,-d],[d,-d]]) candidates.push({ x: x + dx, y: y + dy });
  const ranked = candidates.map(p => {
    const at = { x: clamp(p.x, 38, CANVAS_W - 38 - size.w), y: clamp(p.y, 32, CANVAS_H * .87 - size.h), ...size };
    const blocked = detailOverlap(at, plan);
    return { ...at, blocked, distance: Math.hypot(at.x - x, at.y - y) };
  }).sort((a,b) => (a.blocked > .015 ? 1 : 0) - (b.blocked > .015 ? 1 : 0) || a.distance - b.distance || a.blocked - b.blocked);
  return ranked[0];
}

function styledCallout(c: Callout, wording?: string) {
  const fontSize = c.fontSize;
  return makeTextLayer({ id: 'reference-callout', label: c.role, sample: c.text, props: { font: c.font, fontSize, fill: c.fill, fill2: c.fill2, fillStops: c.fillStops, stroke: c.stroke, strokeWidth: fontSize * c.strokeRatio, rotation: c.rotation, uppercase: false, letterSpacing: c.letterSpacing, lineHeight: 1, shadow: hard(fontSize * c.shadowRatio) } }, { text: wording ?? c.text });
}

// ---------- the arrow

// Where the arrow artwork (600 by 640) starts and ends, so it can be laid exactly between two points.
const ART: Record<ArrowShape, { tail: Point; tip: Point }> = {
  straight: { tail: [300, 92], tip: [300, 568] },
  curved: { tail: [464, 88], tip: [200, 564] },
};

/**
 * Position, rotation and size that make the arrow artwork run from `start` to `end`.
 * `mirror` flips it left to right, so the curved one can bend either way.
 */
export function aimArrow(shape: ArrowShape, start: { x: number; y: number }, end: { x: number; y: number }, mirror = false) {
  const m = mirror ? -1 : 1;
  const tail = { x: ART[shape].tail[0] * m, y: ART[shape].tail[1] }, tip = { x: ART[shape].tip[0] * m, y: ART[shape].tip[1] };
  const scale = Math.hypot(end.x - start.x, end.y - start.y) / Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const turn = Math.atan2(end.y - start.y, end.x - start.x) - Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return {
    x: Math.round(start.x - (tail.x * cos - tail.y * sin) * scale),
    y: Math.round(start.y - (tail.x * sin + tail.y * cos) * scale),
    rotation: Math.round(((turn * 180) / Math.PI) * 10) / 10,
    scaleX: scale * m,
    scaleY: scale,
  };
}

type Arrow = { shape: ArrowShape; start: { x: number; y: number }; end: { x: number; y: number }; mirror: boolean };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The arrow leads the eye from the label to the prize. It leaves from just under the label and swings round into
 * the prize's open side (the side facing the middle of the picture), stopping just outside its edge with the head
 * turned toward it. No arrow when there is no room for one, or when it would cross a face.
 */
function placeArrow(plan: Plan, label: Rect, longest: number): Arrow | null {
  const prize = rectOf(plan.prize);
  const pc = { x: prize.x + prize.w / 2, y: prize.y + prize.h / 2 };
  const above = label.y + label.h <= prize.y + prize.h * 0.35;
  let start: { x: number; y: number }, end: { x: number; y: number };
  if (above) {
    // Into the side of the prize, a little above its middle, from the side that faces the picture's centre.
    const side = pc.x >= CANVAS_W / 2 ? -1 : 1;
    end = { x: pc.x + side * (prize.w / 2 + 30), y: prize.y + prize.h * 0.42 };
    start = { x: clamp(end.x + side * 30, label.x + label.w * 0.12, label.x + label.w * 0.88), y: label.y + label.h + 8 };
  } else {
    // Label beside or below the prize: the nearest point of the prize, backed off a little.
    start = { x: clamp(pc.x, label.x + label.w * 0.3, label.x + label.w * 0.7), y: label.y + label.h / 2 <= pc.y ? label.y + label.h + 8 : label.y - 8 };
    const near = { x: clamp(start.x, prize.x, prize.x + prize.w), y: clamp(start.y, prize.y, prize.y + prize.h) };
    const d = Math.hypot(near.x - start.x, near.y - start.y) || 1;
    end = { x: near.x - ((near.x - start.x) / d) * 30, y: near.y - ((near.y - start.y) / d) * 30 };
  }
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  if (dist < 180) return null;
  // A very long arrow gets heavy, so it starts closer to the prize and leaves the gap at the label.
  if (dist > longest) start = { x: end.x - ((end.x - start.x) / dist) * longest, y: end.y - ((end.y - start.y) / dist) * longest };
  // The head of the curved artwork is turned 29 degrees away from the line it travels along: one way as drawn,
  // the other way flipped. Whichever turns the head toward the prize is used.
  const travel = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  const wanted = (Math.atan2(pc.y - end.y, pc.x - end.x) * 180) / Math.PI;
  const off = (a: number) => Math.abs(((a - wanted + 540) % 360) - 180);
  const arrow: Arrow = { shape: 'curved', start, end, mirror: off(travel + 29) < off(travel - 29) };
  const transform = aimArrow(arrow.shape, start, end, arrow.mirror), turn = transform.rotation * Math.PI / 180;
  const corners = [[0, 0], [600, 0], [0, 640], [600, 640]].map(([x, y]) => ({
    x: transform.x + x * transform.scaleX * Math.cos(turn) - y * transform.scaleY * Math.sin(turn),
    y: transform.y + x * transform.scaleX * Math.sin(turn) + y * transform.scaleY * Math.cos(turn),
  }));
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  const at = { x, y, w: Math.max(...corners.map(p => p.x)) - x, h: Math.max(...corners.map(p => p.y)) - y };
  const obstacles = [...plan.faces.map(rectOf), label, ...(plan.character ? [rectOf(plan.character)] : [])];
  if (at.x < 40 || at.y < 40 || at.x + at.w > CANVAS_W - 40 || at.y + at.h > CANVAS_H - 40 || obstacles.some(f => covered(at, f) > 0.02)) return null;
  return arrow;
}

// ---------- three takes

export type TakeId = 'clean' | 'loud' | 'minimal';
export type Take = {
  id: TakeId;
  name: string;
  label: TextLayer | null;
  marks: TextLayer[];
  texts?: TextLayer[];
  arrows?: ImageLayer[];
  issues: string[];
  usable?: boolean;
  arrow: Arrow | null;
  /** Whether the label is still tall enough to read on a Roblox home tile. */
  readable: boolean;
  preview: string;
};

/** A Roblox home tile is about 234 pixels wide. Capital letters shorter than this many pixels there turn to mush. */
const TILE = 234, SMALLEST = 9;

const TAKE_IDS: TakeId[] = ['clean', 'loud', 'minimal'];
/** Render the designer's actual measurements, with bounded safety checks only. */
export function buildTakes(plan: Plan, wording: string, px: Pixels, existing?: Layer[]): Omit<Take, 'preview'>[] {
  if (existing) return buildExistingTakes(plan, px, existing);
  return plan.layouts.map((layout, index) => {
    const issues: string[] = [], occupied = [...plan.protected];
    const texts = (layout.callouts ?? []).map(c => {
      const chosen = c.role !== 'gain' && wording && wording !== plan.wordings[0]?.text ? wording : undefined;
      let label = styledCallout(c, chosen);
      const target = rectOf(c.box), initial = bounds(label);
      const fit = Math.min(1, target.w / initial.w, target.h / initial.h);
      label = styledCallout({ ...c, fontSize: c.fontSize * fit }, chosen);
      const size = bounds(label);
      const at = safeSpot(size, [c.box[0] + c.box[2] / 2, c.box[1] + c.box[3] / 2], { ...plan, protected: occupied });
      label = { ...label, name: c.role === 'gain' ? 'Gain' : c.role === 'counter' ? 'Counter' : 'Label', ...originForInkCenter(label, { x: at.x + at.w / 2, y: at.y + at.h / 2 }) };
      if (at.blocked > .015) issues.push(label.name + ': protected detail overlap');
      if (at.distance > 110) issues.push(label.name + ': anchor outside usable frame');
      if (label.fontSize * CAP * TILE / CANVAS_W < (c.role === 'gain' ? 7 : SMALLEST)) issues.push(label.name + ': small text');
      occupied.push([at.x / CANVAS_W, at.y / CANVAS_H, at.w / CANVAS_W, at.h / CANVAS_H]);
      return label;
    });
    const main = (layout.callouts ?? []).findIndex(c => c.role !== 'gain');
    const label = main >= 0 ? texts[main] : null;
    const arrow = layout.arrow && label ? placeArrow(plan, layerRect(label), 340) : null;
    return { id: TAKE_IDS[index], name: layout.name, label, marks: texts.filter((_, i) => i !== main), arrow, readable: !issues.some(s => s.includes('small text')), issues };
  });
}

function buildExistingTakes(plan: Plan, px: Pixels, layers: Layer[]): Omit<Take, 'preview'>[] {
  return plan.layouts.map((layout, index) => {
    const occupied: Box[] = [...plan.protected], issues: string[] = [];
    const moved = layers.map(original => {
      const p = layout?.placements.find(p => p.id === original.id);
      let layer = { ...original, rotation: p?.rotation ?? original.rotation, scaleX: original.scaleX * (p?.scale ?? 1), scaleY: original.scaleY * (p?.scale ?? 1) };
      let r = layerRect(layer);
      // Fit the complete rotated outline into the usable frame without changing words or styling.
      const fit = Math.min(1, CANVAS_W * .9 / r.w, CANVAS_H * .79 / r.h);
      layer = { ...layer, scaleX: layer.scaleX * fit, scaleY: layer.scaleY * fit };
      r = layerRect(layer);
      const local = { ...plan, protected: occupied, labelBox: layout?.labelBox ?? plan.labelBox };
      const originalRect = layerRect(original);
      const desired = p ? { x: p.center[0] * CANVAS_W, y: p.center[1] * CANVAS_H } : { x: originalRect.x+originalRect.w/2, y: originalRect.y+originalRect.h/2 };
      let at = { x: clamp(desired.x - r.w / 2, CANVAS_W * .035, CANVAS_W * .965 - r.w), y: clamp(desired.y - r.h / 2, CANVAS_H * .04, CANVAS_H * .87 - r.h), w: r.w, h: r.h };
      if (detailOverlap(at, local) > .015) {
        const spot = safeSpot(r, [desired.x / CANVAS_W, desired.y / CANVAS_H], local);
        at = { ...at, x: spot.x, y: spot.y };
      }
      layer = { ...layer, ...originForInkCenter(layer, { x: at.x + at.w / 2, y: at.y + at.h / 2 }) };
      if (detailOverlap(at, local) > .015) issues.push(`${original.name}: limited free space`);
      if (layer.type === 'text' && layer.fontSize * Math.abs(layer.scaleY) * CAP * TILE / CANVAS_W < SMALLEST) issues.push(`${original.name}: small text`);
      occupied.push([at.x / CANVAS_W, at.y / CANVAS_H, at.w / CANVAS_W, at.h / CANVAS_H]);
      return layer;
    });
    return { id: TAKE_IDS[index], name: layout?.name ?? ['Object focus', 'Action focus', 'Minimal'][index], label: null, marks: [], arrow: null, texts: moved.filter((l): l is TextLayer => l.type === 'text'), arrows: moved.filter((l): l is ImageLayer => l.type === 'image'), readable: !issues.some(s => s.includes('small text')), issues };
  });
}

const arrowImages = new Map<string, Promise<HTMLImageElement>>();
function arrowImage(shape: ArrowShape) {
  if (!arrowImages.has(shape)) {
    const img = new Image();
    img.src = arrowPreview('#F5311F', shape);
    arrowImages.set(shape, img.decode().then(() => img));
  }
  return arrowImages.get(shape)!;
}

/** A small picture of one take over the artwork, drawn with the same text code the canvas uses. */
export async function previewTake(image: CanvasImageSource, take: Omit<Take, 'preview'>): Promise<string> {
  const W = 320, H = 180, k = W / CANVAS_W;
  const stage = new Konva.Stage({ container: document.createElement('div'), width: W, height: H });
  const layer = new Konva.Layer();
  const root = new Konva.Group({ scaleX: k, scaleY: k });
  stage.add(layer);
  layer.add(root);
  root.add(new Konva.Image({ image: image as HTMLImageElement, width: CANVAS_W, height: CANVAS_H }));
  if (take.arrow) root.add(new Konva.Image({ image: await arrowImage(take.arrow.shape), width: 600, height: 640, ...aimArrow(take.arrow.shape, take.arrow.start, take.arrow.end, take.arrow.mirror) }));
  for (const arrow of take.arrows ?? []) {
    const asset = await loadAsset(arrow.assetId);
    if (asset) root.add(new Konva.Image({ image: asset.img, width: arrow.width, height: arrow.height, x: arrow.x, y: arrow.y, rotation: arrow.rotation, scaleX: arrow.scaleX, scaleY: arrow.scaleY, opacity: arrow.opacity }));
  }
  const texts = [take.label, ...take.marks, ...(take.texts ?? [])].filter((t): t is TextLayer => !!t);
  for (const text of texts) {
    root.add(new Konva.Text({ ...textProps(text), x: text.x, y: text.y, rotation: text.rotation, scaleX: text.scaleX, scaleY: text.scaleY, opacity: text.opacity, shadowColor: text.shadow.color, shadowBlur: text.shadow.blur, shadowOffsetX: text.shadow.offsetX, shadowOffsetY: text.shadow.offsetY, shadowOpacity: text.shadow.enabled ? text.shadow.opacity : 0 }));
  }
  layer.draw();
  // Check the actual raster against the base, rather than assuming font size implies contrast.
  const rendered = layer.toCanvas(), baseline = document.createElement('canvas');
  baseline.width = W; baseline.height = H;
  baseline.getContext('2d')!.drawImage(image, 0, 0, W, H);
  const before = baseline.getContext('2d')!.getImageData(0, 0, W, H).data, after = rendered.getContext('2d')!.getImageData(0, 0, W, H).data;
  for (const text of texts) {
    const r = layerRect(text); let pixels = 0, distinct = 0;
    for (let y = Math.max(0, Math.floor(r.y * k)); y < Math.min(H, (r.y + r.h) * k); y++) for (let x = Math.max(0, Math.floor(r.x * k)); x < Math.min(W, (r.x + r.w) * k); x++) {
      const i = (y * W + x) * 4; pixels++;
      if (Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2])) > 55) distinct++;
    }
    if (pixels && distinct / pixels < .035) { take.issues.push(`${text.name}: low rendered contrast`); take.readable = false; }
  }
  const url = stage.toDataURL({ pixelRatio: 1.5, mimeType: 'image/jpeg', quality: 0.85 });
  stage.destroy();
  return url;
}
