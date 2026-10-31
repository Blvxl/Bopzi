import type { Doc, Layer } from '@/lib/types';

export type Point = [number, number];
export type Box = [number, number, number, number];
export type LabelStyle = 'white' | 'rainbow' | 'warm';
export type Wording = { kind: 'value' | 'title' | 'action'; text: string };
export type Placement = { id: string; center: Point; scale: number; rotation: number };
export type Callout = { role: 'counter' | 'gain' | 'title' | 'action'; anchor: 'prize' | 'action' | 'scene'; text: string; box: Box; font: string; fontSize: number; rotation: number; fill: string; fill2?: string; fillStops?: string[]; stroke: string; strokeRatio: number; shadowRatio: number; letterSpacing: number };
export type Layout = { name: string; heading: boolean; labelBox: Box | null; arrow: boolean; plusAt: Point[]; placements: Placement[]; callouts?: Callout[]; referenceIndex: number | null; rationale: string };
export type Plan = { wordings: Wording[]; prize: Box; faces: Box[]; character: Box | null; protected: Box[]; protectedOutlines: Point[][]; subjectOutline: Point[]; prizeOutline: Point[]; labelBox: Box | null; arrow: boolean; style: LabelStyle; plusText: string; plusAt: Point[]; layouts: Layout[] };
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
export const point = (v: unknown): Point | null => Array.isArray(v) && v.length === 2 && v.every(unit) ? [v[0], v[1]] : null;
export const box = (v: unknown): Box | null => {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(unit)) return null;
  const w = Math.min(v[2], 1 - v[0]), h = Math.min(v[3], 1 - v[1]);
  return w > .01 && h > .01 ? [v[0], v[1], w, h] : null;
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown) => Array.isArray(v) ? v : [];
const words = (v: unknown, max = 24) => typeof v === 'string' ? v.replace(/[^\p{L}\p{N} +\-/$%!?.,'×]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const points = (v: unknown, max: number) => list(v).map(point).filter((p): p is Point => !!p).slice(0, max);
function polygon(v: unknown) { const p = points(v, 24); return p.length >= 3 ? p : []; }
function placements(v: unknown): Placement[] {
  return list(v).flatMap(v => {
    const o = record(v), center = point(o.center);
    return typeof o.id === 'string' && o.id.length <= 100 && center ? [{ id: o.id, center, scale: typeof o.scale === 'number' && Number.isFinite(o.scale) ? Math.min(1.5, Math.max(.5, o.scale)) : 1, rotation: typeof o.rotation === 'number' && Number.isFinite(o.rotation) ? Math.min(18, Math.max(-18, o.rotation)) : 0 }] : [];
  }).filter((p, i, all) => all.findIndex(v => v.id === p.id) === i).slice(0, 24);
}
const bounded = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const color = (v: unknown, fallback: string) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
function callouts(v: unknown): Callout[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 4).flatMap(v => {
    const o = record(v), at = box(o.box), text = words(o.text);
    if (!at || !text) return [];
    const font = typeof o.font === 'string' && ['lilita','anton','luckiest','titan','bangers','sora'].includes(o.font) ? o.font : 'lilita';
    const fills = list(o.fillStops).filter((v): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)).slice(0, 8);
    return [{ role: ['counter','gain','action'].includes(String(o.role)) ? o.role as Callout['role'] : 'title', anchor: o.anchor === 'prize' || o.anchor === 'action' ? o.anchor : 'scene', text, box: at, font, fontSize: bounded(o.fontSize, 150, 48, 500), rotation: bounded(o.rotation, 0, -18, 18), fill: color(o.fill, '#FFFFFF'), fill2: typeof o.fill2 === 'string' ? color(o.fill2, '#FFFFFF') : undefined, fillStops: fills.length > 1 ? fills : undefined, stroke: color(o.stroke, '#111111'), strokeRatio: bounded(o.strokeRatio, .06, 0, .15), shadowRatio: bounded(o.shadowRatio, 0, 0, .12), letterSpacing: bounded(o.letterSpacing, 0, -10, 20) }];
  });
}
export function parseLayouts(v: unknown): Layout[] {
  return list(v).slice(0, 3).map((v, i) => {
    const o = record(v);
    return { name: words(o.name, 28) || ['Object focus', 'Action focus', 'Minimal'][i], heading: o.heading !== false, labelBox: box(o.labelBox), arrow: o.arrow === true, plusAt: points(o.plusAt, 2), placements: placements(o.placements), callouts: callouts(o.callouts), referenceIndex: Number.isInteger(o.referenceIndex) && Number(o.referenceIndex) >= 0 && Number(o.referenceIndex) <= 6 ? Number(o.referenceIndex) : null, rationale: words(o.rationale, 180) };
  });
}
export function parsePlan(answer: unknown): Plan | null {
  if (typeof answer !== 'string') return null;
  try {
    const o = record(JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)));
    const prize = box(o.prize);
    if (!prize) return null;
    const wordings = list(o.wordings).flatMap(v => { const w = record(v), text = words(w.text); return text ? [{ kind: w.kind === 'value' || w.kind === 'action' ? w.kind : 'title', text } as Wording] : []; }).filter((w, i, all) => all.findIndex(v => v.text === w.text) === i).slice(0, 3);
    const plus = record(o.plus), plusText = words(plus.text, 6);
    return { wordings, prize, faces: list(o.faces).map(box).filter((b): b is Box => !!b).slice(0, 8), character: box(o.character), protected: list(o.protected).map(box).filter((b): b is Box => !!b).slice(0, 12), protectedOutlines: list(o.protectedOutlines).map(polygon).filter(p => p.length >= 3).slice(0, 6), subjectOutline: polygon(o.subjectOutline), prizeOutline: polygon(o.prizeOutline), labelBox: box(o.labelBox), arrow: o.arrow === true, style: o.style === 'warm' || o.style === 'rainbow' ? o.style : 'white', plusText, plusAt: plusText ? points(plus.at, 2) : [], layouts: parseLayouts(o.layouts) };
  } catch { return null; }
}
export type Review = { best: number; feedback: string; layouts: Layout[]; accepted: boolean[] };
export function parseReview(answer: unknown, count: number): Review | null {
  if (typeof answer !== 'string') return null;
  try {
    const o = record(JSON.parse(answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1)));
    if (!Number.isInteger(o.best) || Number(o.best) < 0 || Number(o.best) >= count) return null;
    if (!Array.isArray(o.accepted) || o.accepted.length !== count || !o.accepted.every(v => typeof v === 'boolean')) return null;
    if (list(o.layouts).length !== 0 && list(o.layouts).length !== count) return null;
    return { best: Number(o.best), feedback: words(o.feedback, 160), layouts: parseLayouts(o.layouts), accepted: list(o.accepted).slice(0, count).map(v => v === true) };
  } catch { return null; }
}
/** Applying an existing-layer layout changes geometry only, with pins rechecked at application time. */
export function applyExistingLayout(doc: Doc, placements: Layer[]): Doc {
  return { ...doc, layers: doc.layers.map(layer => {
    const move = placements.find(v => v.id === layer.id);
    return move && layer.visible && !layer.locked ? { ...layer, x: move.x, y: move.y, rotation: move.rotation, scaleX: move.scaleX, scaleY: move.scaleY } : layer;
  }) };
}
