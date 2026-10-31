import { easeAt, easingExpression, isEasing, validateBezier, type Easing, type Bezier } from './easing';

export type Transform = { x: number; y: number; scale: number; rotation: number; opacity: number };
export type Keyframe = Transform & { time: number; easing: Easing; curve?: Bezier };
export type SpeedPoint = { at: number; speed: number };
export type MotionClip = { in: number; out: number; speed: number; speedPoints?: SpeedPoint[]; freeze?: number; hold?: number; reverse?: boolean };
export const IDENTITY: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function validateKeyframes(value: unknown): Keyframe[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 32) throw new Error('Use at most 32 keyframes per layer.');
  const read = (v: unknown, lo: number, hi: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error('Invalid keyframe value.'); return v; };
  const frames = value.map(k => {
    if (!k || typeof k !== 'object' || !isEasing(k.easing)) throw new Error('Invalid keyframe.');
    return { time: read(k.time, 0, 1200), x: read(k.x, -1, 1), y: read(k.y, -1, 1), scale: read(k.scale, .1, 5), rotation: read(k.rotation, -360, 360), opacity: read(k.opacity, 0, 1), easing: k.easing, ...(k.curve ? { curve: validateBezier(k.curve) } : {}) } as Keyframe;
  }).sort((a, b) => a.time - b.time);
  if (frames.some((k, i) => i && k.time - frames[i - 1].time < .0001)) throw new Error('Keyframes must have distinct times.');
  return frames;
}
export function validateSpeedPoints(value: unknown): SpeedPoint[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) throw new Error('A speed curve needs 2–12 points.');
  const points = value.map(p => { if (!p || !Number.isFinite(p.at) || p.at < 0 || p.at > 1 || !Number.isFinite(p.speed) || p.speed < .25 || p.speed > 4) throw new Error('Invalid speed curve.'); return { at: p.at as number, speed: p.speed as number }; }).sort((a, b) => a.at - b.at);
  if (points[0].at !== 0 || points.at(-1)!.at !== 1 || points.some((p, i) => i && p.at - points[i - 1].at < .001)) throw new Error('Speed curves must run from 0% to 100%, with distinct points.');
  return points;
}
export function transformAt(frames: Keyframe[] | undefined, time: number): Transform {
  if (!frames?.length) return IDENTITY;
  const b = frames.findIndex(k => k.time > time);
  if (b === 0) return frames[0]; if (b < 0) return frames.at(-1)!;
  const from = frames[b - 1], to = frames[b], p = easeAt(from.easing, (time - from.time) / (to.time - from.time), from.curve);
  return Object.fromEntries(Object.keys(IDENTITY).map(key => { const k = key as keyof Transform; return [k, from[k] + (to[k] - from[k]) * p]; })) as Transform;
}
export function transformExpressions(frames: Keyframe[], time: string): Record<keyof Transform, string> {
  return Object.fromEntries(Object.keys(IDENTITY).map(key => {
    const k = key as keyof Transform; let result = String(frames.at(-1)?.[k] ?? IDENTITY[k]);
    for (let i = frames.length - 2; i >= 0; i--) { const a = frames[i], b = frames[i + 1]; const p = easingExpression(a.easing, `((${time})-${a.time})/${b.time - a.time}`, a.curve); result = `if(lt(${time},${b.time}),${a[k]}+(${b[k] - a[k]})*(${p}),${result})`; }
    return [k, result];
  })) as Record<keyof Transform, string>;
}
export function applyTransform(ctx: CanvasRenderingContext2D, tr: Transform, w: number, h: number, cx = .5, cy = .5) {
  ctx.translate(w * (cx + tr.x), h * (cy + tr.y)); ctx.rotate(tr.rotation * Math.PI / 180); ctx.scale(tr.scale, tr.scale); ctx.translate(-w * cx, -h * cy); ctx.globalAlpha *= clamp(tr.opacity, 0, 1);
}
export function speedArea(points: SpeedPoint[]) { return points.slice(1).reduce((s, p, i) => s + (p.at - points[i].at) * (p.speed + points[i].speed) / 2, 0); }
export function motionLength(c: MotionClip) { return c.freeze !== undefined ? c.hold ?? 1 : (c.out - c.in) / (c.speedPoints ? speedArea(c.speedPoints) : c.speed); }
export function speedAt(c: MotionClip, t: number) {
  if (!c.speedPoints) return c.speed;
  const u = clamp(t / motionLength(c), 0, 1), p = c.speedPoints, i = Math.max(0, p.findIndex(k => k.at >= u) - 1), a = p[i], b = p[i + 1];
  return a.speed + (b.speed - a.speed) * (u - a.at) / (b.at - a.at);
}
export function sourceAt(c: MotionClip, t: number) {
  if (c.freeze !== undefined) return c.freeze;
  if (!c.speedPoints) return clamp(c.in + t * c.speed, c.in, c.out);
  const length = motionLength(c), u = clamp(t / length, 0, 1), p = c.speedPoints; let area = 0;
  for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], d = clamp(u - a.at, 0, b.at - a.at); area += a.speed * d + (b.speed - a.speed) * d * d / (2 * (b.at - a.at)); }
  return clamp(c.in + area * length, c.in, c.out);
}
/**
 * The source second on screen at a moment of the clip: sourceAt, mirrored inside the trim for a reversed clip, so a
 * speed curve still shapes the playback the viewer sees. Every picture and sound reader goes through this.
 */
export function pictureAt(c: MotionClip, t: number) { const s = sourceAt(c, t); return c.reverse && c.freeze === undefined ? c.in + c.out - s : s; }
/** Exact inverse of sourceAt, shared by export timestamps and split/trim operations. */
export function outputAt(c: MotionClip, source: number) {
  if (!c.speedPoints) return (source - c.in) / c.speed;
  const length = motionLength(c), p = c.speedPoints; let consumed = 0;
  for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], span = (b.at - a.at) * length, slope = (b.speed - a.speed) / span, area = span * (a.speed + b.speed) / 2;
    if (source - c.in <= consumed + area || i === p.length - 2) { const s = clamp(source - c.in - consumed, 0, area); return a.at * length + (Math.abs(slope) < 1e-8 ? s / a.speed : 2 * s / (a.speed + Math.sqrt(Math.max(0, a.speed * a.speed + 2 * slope * s)))); } consumed += area;
  }
  return length;
}
export function speedTimestamp(c: MotionClip, sourceTime = '(PTS-STARTPTS)*TB') {
  if (!c.speedPoints) return `(${sourceTime})/${c.speed}`;
  const length = motionLength(c), p = c.speedPoints; let consumed = 0; const spans: { end: number; expr: string }[] = [];
  for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], span = (b.at - a.at) * length, slope = (b.speed - a.speed) / span, area = span * (a.speed + b.speed) / 2, s = `(max(0,(${sourceTime})-${consumed}))`;
    spans.push({ end: consumed + area, expr: `${a.at * length}+${Math.abs(slope) < 1e-8 ? `${s}/${a.speed}` : `2*${s}/(${a.speed}+sqrt(max(0,${a.speed * a.speed}+${2 * slope}*${s})))`}` }); consumed += area;
  }
  let result = spans.at(-1)!.expr; for (let i = spans.length - 2; i >= 0; i--) result = `if(lt(${sourceTime},${spans[i].end}),${spans[i].expr},${result})`; return result;
}
export function sliceMotion<T extends MotionClip & { keyframes?: Keyframe[] }>(c: T, from: number, to: number): T {
  const length = motionLength(c), span = to - from;
  const speedPoints = c.speedPoints ? [from, ...c.speedPoints.map(p => p.at * length).filter(t => t > from && t < to), to].map(t => ({ at: (t - from) / span, speed: speedAt(c, t) })) : undefined;
  const keyframes = c.keyframes?.length ? [from, ...c.keyframes.map(k => k.time).filter(t => t > from && t < to), to].map(t => ({ ...transformAt(c.keyframes, t), time: t - from, easing: [...c.keyframes!].reverse().find(k => k.time <= t)?.easing ?? c.keyframes![0].easing, curve: [...c.keyframes!].reverse().find(k => k.time <= t)?.curve })) : undefined;
  // A reversed piece covers the mirrored source range: its first moments are the end of the trim.
  const range = c.freeze !== undefined ? [c.in, c.out] : c.reverse ? [c.in + c.out - sourceAt(c, to), c.in + c.out - sourceAt(c, from)] : [sourceAt(c, from), sourceAt(c, to)];
  return { ...c, in: range[0], out: range[1], ...(speedPoints ? { speedPoints } : {}), ...(keyframes ? { keyframes } : {}), ...(c.freeze !== undefined ? { hold: span } : {}) };
}
export const SPEED_PRESETS: Record<string, SpeedPoint[]> = {
  impact: [{ at: 0, speed: 1 }, { at: .4, speed: 1 }, { at: .55, speed: .25 }, { at: .75, speed: .25 }, { at: 1, speed: 2 }],
  montage: [{ at: 0, speed: 2 }, { at: .3, speed: .5 }, { at: .7, speed: .5 }, { at: 1, speed: 2 }],
  accelerate: [{ at: 0, speed: .5 }, { at: 1, speed: 3 }],
};
/** Short, pitch-preserving tempo segments keep ramped gameplay audio aligned to the picture. */
export function rampAudioFilter(c: MotionClip): string {
  const length = motionLength(c), count = Math.max(1, Math.min(256, Math.ceil(length * 12))), parts: string[] = [];
  parts.push(`asplit=${count}${Array.from({ length: count }, (_, i) => `[s${i}]`).join('')}`);
  for (let i = 0; i < count; i++) { const from = i * length / count, to = (i + 1) * length / count, a = sourceAt(c, from) - c.in, b = sourceAt(c, to) - c.in, speed = (b - a) / (to - from); const tempo = speed < .5 ? `atempo=.5,atempo=${speed / .5}` : speed > 2 ? `atempo=2,atempo=${speed / 2}` : `atempo=${speed}`;
    parts.push(`[s${i}]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,${tempo},apad=whole_dur=${to - from},atrim=duration=${to - from}[r${i}]`);
  }
  parts.push(`${Array.from({ length: count }, (_, i) => `[r${i}]`).join('')}concat=n=${count}:v=0:a=1`); return parts.join(';');
}
