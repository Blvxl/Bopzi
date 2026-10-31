import { easeAt, easingExpression, type Easing, type Bezier } from './easing';
import { trackedPointSmooth } from './follow';
/**
 * Animation presets. Every preset is hand-tuned here once, and both the preview and the export read the same math,
 * so what plays in the editor is what the MP4 shows. The AI only picks a preset and fills in its settings; it never
 * invents motion, which is what keeps the result polished.
 * Pure functions only: this file runs in the browser and on the export server.
 */
export type CounterEffect = { /** A highlight it moves with (follow.ts). */ follow?: string; countDelay?: number; countDuration?: number; easing?: Easing; curve?: Bezier; entrance?: 'none' | 'pop'; bounce?: boolean; decimals?: number; step?: number; padding?: number; separators?: boolean; id: string; kind: 'counter'; start: number; duration: number; from: number; to: number; prefix: string; suffix: string; format: 'full' | 'short'; x: number; y: number; size: number; color: string; font: string };
/** `blur` (punch zooms, on unless false): smears the picture along the zoom while it moves, like a real camera. */
export type ZoomEffect = { id: string; kind: 'zoom'; start: number; duration: number; amount: number; x: number; y: number; follow?: string; mode?: 'punch' | 'hold'; rampDuration?: number; easing?: Easing; curve?: Bezier; blur?: boolean };
/** Punch zooms with motion blur, for the preview and the export to blur the same moments. */
export const blurredZooms = (effects: Effect[]) => effects.filter((e): e is ZoomEffect => e.kind === 'zoom' && e.mode !== 'hold' && e.blur !== false);
export type ShakeEffect = { id: string; kind: 'shake'; start: number; duration: number; strength: number };
export type FlashEffect = { id: string; kind: 'flash'; start: number; duration: number; color: string };
/**
 * The object's own outline, frame by frame, found by tracing it through the footage (see track.ts). Each frame is a
 * w × h cut-out, run-length encoded (mask.ts); an empty string is a frame where the object was not found.
 */
export type HighlightMask = { start: number; fps: number; w: number; h: number; frames: string[]; edited?: boolean };
/**
 * Marks something in the shot (x, y its centre, w, h its size, as shares of the frame). Traced, it colours the object's
 * own shape and follows it; otherwise it is a ring or box around that area.
 */
export type HighlightEffect = { id: string; kind: 'highlight'; start: number; duration: number; x: number; y: number; w: number; h: number; color: string; shape: 'ellipse' | 'box'; /** "none" draws nothing but its label: an invisible tracker for titles, logos and bars that follow or go behind it. */ style: 'outline' | 'tint' | 'spotlight' | 'sticker' | 'none'; /** A look applied inside the traced mask: short flash, colour change, or repeating light sweep. */ look?: 'flash' | 'cycle' | 'sweep'; lookColor?: string; endColor?: string; changeAt?: number; every?: number; lookDuration?: number; /** How it appears: springs in, its outline draws itself on, or the colour sweeps in from the edges. */ reveal?: 'pop' | 'draw' | 'fade'; /** The glow breathes in and out. */ pulse?: boolean; /** A word or two shown above the object with an arrow pointing at it. */ label?: string; points?: { x: number; y: number; label: 0 | 1 }[]; mask?: HighlightMask };
/**
 * Hides part of the footage: a username, the chat, a face. x, y its centre and w, h its size, as shares of the frame;
 * `strength` 0–1. Applied to the footage itself, under titles and captions (blur.ts).
 */
export type BlurEffect = { id: string; kind: 'blur'; start: number; duration: number; x: number; y: number; w: number; h: number; style: 'blur' | 'pixelate'; strength: number };
/**
 * A progress or XP bar that fills from `from` to `to` percent over `fill` seconds (the layer's length less a short hold
 * by default). x, y its centre and w, h its size as shares of the frame; always fully rounded. `label` and the shown
 * percentage sit inside it. `follow` is a highlight it rides along with (follow.ts), like a health bar over a player.
 */
export type BarEffect = { id: string; kind: 'bar'; start: number; duration: number; x: number; y: number; w: number; h: number; from: number; to: number; fill?: number; easing?: Easing; color: string; back: string; label?: string; showValue?: boolean; follow?: string };
/** Every effect can carry a built-in sound effect (sounds.ts), played when it hits (effectSoundAt in sfx.ts). */
export type Effect = (CounterEffect | ZoomEffect | ShakeEffect | FlashEffect | HighlightEffect | BlurEffect | BarEffect) & { sound?: string };
export const EFFECT_KINDS = ['counter', 'zoom', 'shake', 'flash', 'highlight', 'blur', 'bar'] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
export const easeOutQuart = (p: number) => 1 - (1 - p) ** 4;
/** Overshoots a little and settles, which is what makes a pop feel springy instead of mechanical. */
export const easeOutBack = (p: number) => { const c = 1.70158; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };
const active = (e: { start: number; duration: number }, t: number) => t >= e.start && t < e.start + e.duration;

// ---- text that pops: titles with the "pop" animation, and the counter's entrance
const POP_IN = .32, POP_OUT = .16;
/** Scale and opacity of a popping item at a moment: springs in, holds, shrinks away. */
export function popAt(start: number, duration: number, t: number) {
  const u = t - start, left = start + duration - t;
  if (u < 0 || left <= 0) return { alpha: 0, scale: 1 };
  if (u < POP_IN) return { alpha: clamp01(u / .1), scale: .4 + .6 * easeOutBack(u / POP_IN) };
  if (left < POP_OUT) { const p = 1 - left / POP_OUT; return { alpha: 1 - p, scale: 1 - .15 * easeOutCubic(p) }; }
  return { alpha: 1, scale: 1 };
}

// ---- title animations beyond pop and fade: how a title moves at a moment
/** Offset as shares of the frame, turn in radians, how many characters show (typewriter), and the glitch's strength. */
export type TitleMotion = { alpha: number; scale: number; dx: number; dy: number; rot: number; chars?: number; glitch: number };
const bounceOut = (p: number) => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375; return n * (p -= 2.625 / d) * p + .984375; };
export function titleMotion(kind: string, start: number, duration: number, t: number, length: number): TitleMotion | null {
  const u = t - start, left = start + duration - t;
  if (u < 0 || left <= 0) return null;
  const still: TitleMotion = { alpha: 1, scale: 1, dx: 0, dy: 0, rot: 0, glitch: 0 }, out = clamp01(left / .2);
  if (kind === 'typewriter') return { ...still, alpha: out, chars: Math.min(length, Math.floor(u * Math.max(18, length / Math.max(.4, duration * .6)))) };
  if (kind === 'slide') { const p = clamp01(u / .35); return { ...still, alpha: Math.min(clamp01(u / .15), out), dy: .07 * (1 - easeOutCubic(p)) }; }
  if (kind === 'bounce') { const p = clamp01(u / .7); return { ...still, alpha: Math.min(clamp01(u / .1), out), dy: -.18 * (1 - bounceOut(p)) }; }
  if (kind === 'shake') { const p = popAt(start, duration, t), k = .5 + .5 * Math.sin(u * 3); return { ...still, alpha: p.alpha, scale: p.scale, dx: .004 * k * Math.sin(2 * Math.PI * 16 * u), rot: .025 * k * Math.sin(2 * Math.PI * 11 * u + 1) }; }
  if (kind === 'glitch') {
    // Torn and colour-split as it lands and as it leaves, steady in between.
    const g = Math.max(clamp01(1 - u / .35), clamp01(1 - left / .25)), frame = Math.floor(t * 30), r = (Math.sin(frame * 12.9898) * 43758.5453) % 1;
    return { ...still, alpha: Math.min(clamp01(u / .08), out), dx: g * (r - .5) * .03, glitch: g };
  }
  return null;
}

// ---- counter: rolls fast, slows into the final number, then lands with a small punch
const COUNT_HOLD = .45;
export function formatCount(value: number, format: CounterEffect['format'], options: Pick<CounterEffect, 'decimals' | 'padding' | 'separators'> = {}) {
  const decimals = Math.min(4, Math.max(0, Math.floor(options.decimals ?? 0)));
  const n = Number(value.toFixed(decimals));
  if (format === 'short' && Math.abs(n) >= 1000) {
    const [div, unit] = Math.abs(n) >= 1e9 ? [1e9, 'B'] : Math.abs(n) >= 1e6 ? [1e6, 'M'] : [1e3, 'K'];
    return `${(n / div).toFixed(Math.max(decimals, Math.abs(n / div) >= 100 ? 0 : 1)).replace(/\.0$/, '')}${unit}`;
  }
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, minimumIntegerDigits: Math.max(1, Math.min(12, Math.floor(options.padding ?? 0))), useGrouping: options.separators !== false });
}
export function counterAt(e: CounterEffect, t: number) {
  if (!active(e, t)) return null;
  const run = Math.max(.01, e.countDuration ?? Math.max(.2, e.duration - COUNT_HOLD)), u = t - e.start - (e.countDelay ?? 0);
  const progress = clamp01(u / run);
  const p = clamp01(easeAt(e.easing ?? 'easeOut', progress, e.curve, true));
  const pop = e.entrance === 'none' ? { alpha: 1, scale: 1 } : popAt(e.start, e.duration, t);
  const land = e.bounce !== false && u >= run && u < run + .28 ? Math.sin(Math.PI * (u - run) / .28) * .14 : 0;
  let value = e.from + (e.to - e.from) * p;
  if (e.step && progress < 1 && progress > 0) value = e.from + Math.trunc((value - e.from) / e.step) * e.step;
  return { value, text: e.prefix + formatCount(value, e.format, e) + e.suffix, final: e.prefix + formatCount(e.to, e.format, e) + e.suffix, alpha: pop.alpha, scale: pop.scale + land };
}

// ---- bar: fades in, fills with an ease, holds full, fades out
const BAR_FADE = .15;
export const barFill = (e: Pick<BarEffect, 'duration' | 'fill'>) => Math.max(.05, Math.min(e.duration, e.fill ?? Math.max(.2, e.duration - .5)));
export function barAt(e: BarEffect, t: number) {
  if (!active(e, t)) return null;
  const u = t - e.start, left = e.start + e.duration - t, p = clamp01(easeAt(e.easing ?? 'easeOut', clamp01(u / barFill(e)), undefined, true));
  return { alpha: Math.min(clamp01(u / BAR_FADE), clamp01(left / BAR_FADE)), value: e.from + (e.to - e.from) * p };
}

// ---- flash: instant white (or any colour) that fades out
export function flashAt(e: FlashEffect, t: number) {
  if (!active(e, t)) return 0;
  const u = (t - e.start) / e.duration;
  return u < .08 ? u / .08 : (1 - (u - .08) / .92) ** 2;
}

// ---- highlight: springs in slightly large and settles onto its target, holds, fades away
const MARK_IN = .28, MARK_OUT = .2;
export function highlightAt(e: HighlightEffect, t: number) {
  const u = t - e.start, left = e.start + e.duration - t;
  if (u < 0 || left <= 0) return null;
  if (u < MARK_IN) return { alpha: clamp01(u / .12), scale: 1.25 - .25 * easeOutBack(u / MARK_IN) };
  return { alpha: left < MARK_OUT ? left / MARK_OUT : 1, scale: 1 };
}

// ---- camera: zoom punches and shakes move the footage underneath everything else
const ZOOM_IN = (d: number) => Math.min(.12, d / 3);
function zoomPhase(e: ZoomEffect, t: number) {
  const u = t - e.start, rise = ZOOM_IN(e.duration);
  if (u < 0 || u >= e.duration) return 0;
  return u < rise ? easeAt(e.easing ?? 'easeOut', u / rise, e.curve) : (1 + Math.cos(Math.PI * (u - rise) / (e.duration - rise))) / 2;
}
const holdRamp = (e: ZoomEffect) => Math.max(.01, Math.min(e.rampDuration ?? e.duration, e.duration));
/** Framing as screen = z × point + (ox, oy). Linear in all three, so blending two framings moves the frame's edges in straight lines. */
type Framing = { z: number; ox: number; oy: number };
const focusAt = (e: ZoomEffect, effects: Effect[], t: number) => {
  const subject = e.follow && effects.find((v): v is HighlightEffect => v.kind === 'highlight' && v.id === e.follow);
  return subject ? trackedPointSmooth(subject, t) : { x: e.x, y: e.y };
};
const target = (e: ZoomEffect, effects: Effect[], t: number): Framing => { const p = focusAt(e, effects, t); return { z: e.amount, ox: p.x * (1 - e.amount), oy: p.y * (1 - e.amount) }; };
const blend = (a: Framing, b: Framing, p: number): Framing => ({ z: a.z + (b.z - a.z) * p, ox: a.ox + (b.ox - a.ox) * p, oy: a.oy + (b.oy - a.oy) * p });
/**
 * "Ease in and stay" zooms work like keyframes in CapCut: each one eases from the framing already on screen to its own
 * and then stays there, past the end of its block, until the next one starts. A 1× zoom eases back out.
 * Like CapCut's keyframes they belong to their clip: `clip` is the timeline range of the clip being shown, and only the
 * held zooms that start inside it count, so the next clip starts unzoomed. Without it, every held zoom counts.
 * Returns, in timeline order, each held zoom with the framing it starts from.
 */
export type ClipSpan = readonly [start: number, end: number];
const inClip = (e: { start: number }, clip?: ClipSpan) => !clip || e.start >= clip[0] - 1e-4 && e.start < clip[1] - 1e-4;
function holdChain(effects: Effect[], clip?: ClipSpan) {
  const holds = effects.filter((e): e is ZoomEffect => e.kind === 'zoom' && e.mode === 'hold' && inClip(e, clip)).sort((a, b) => a.start - b.start);
  let from: Framing = { z: 1, ox: 0, oy: 0 };
  return holds.map((e, i) => {
    const link = { e, from };
    // Where this one has got to when the next starts (it may still be easing in).
    const next = holds[i + 1];
    from = blend(from, target(e, effects, next?.start ?? e.start + holdRamp(e)), next ? easeAt(e.easing ?? 'easeInOut', clamp01((next.start - e.start) / holdRamp(e)), e.curve) : 1);
    return link;
  });
}
/** The "ease in and stay" zoom framing the picture at a moment, if any, and how far in it is there. */
export function heldZoomAt(effects: Effect[], t: number, clip?: ClipSpan) {
  const link = holdChain(effects, clip).filter(({ e }) => t >= e.start).pop();
  return link ? { effect: link.e, zoom: heldAt(effects, t, clip).z } : null;
}
function heldAt(effects: Effect[], t: number, clip?: ClipSpan): Framing {
  let framing: Framing = { z: 1, ox: 0, oy: 0 };
  for (const { e, from } of holdChain(effects, clip)) if (t >= e.start) framing = blend(from, target(e, effects, t), easeAt(e.easing ?? 'easeInOut', clamp01((t - e.start) / holdRamp(e)), e.curve));
  return framing;
}
const SHAKE_X = 11, SHAKE_Y = 17;
/**
 * How the footage is framed at a moment: zoom around a focus point, plus an offset, as shares of the frame.
 * Overlapping zooms combine instead of replacing each other: each one scales the picture so far around its own aim
 * point (screen = scale × point + offset). A zoom that is just starting is at 1×, so it never makes the framing jump,
 * which is what used to happen when a second zoom began (for example on the next clip after a split).
 */
export function cameraAt(effects: Effect[], t: number, clip?: ClipSpan) {
  // Held zooms set the base framing; punches and shakes move it from there.
  const held = heldAt(effects, t, clip);
  let scale = held.z, ox = held.ox, oy = held.oy, dx = 0, dy = 0;
  const apply = (z: number, x: number, y: number) => { scale *= z; ox = z * ox + x * (1 - z); oy = z * oy + y * (1 - z); };
  for (const e of effects) {
    if (e.kind === 'zoom' && e.mode !== 'hold' && active(e, t)) { const p = focusAt(e, effects, t); apply(1 + (e.amount - 1) * zoomPhase(e, t), p.x, p.y); }
    if (e.kind === 'shake' && active(e, t)) {
      const u = t - e.start, decay = (1 - u / e.duration) ** 2;
      dx += e.strength * Math.sin(2 * Math.PI * SHAKE_X * u) * decay; dy += e.strength * .8 * Math.sin(2 * Math.PI * SHAKE_Y * u + 1.3) * decay;
      // Zooming in slightly around the centre hides the frame's edges while it moves.
      apply(1 + 2.2 * e.strength * decay, .5, .5);
    }
  }
  // Back to one zoom around one focus point, the form the preview and export draw with.
  const focus = (o: number) => Math.abs(1 - scale) > 1e-6 ? o / (1 - scale) : .5;
  return { zoom: scale, fx: focus(ox), fy: focus(oy), dx, dy };
}

/**
 * The same camera as ffmpeg expressions of segment time (`time`, an expression in seconds), for the export.
 * `offset` is where the segment starts on the timeline. Kept next to cameraAt so the two never drift apart.
 */
export function cameraExpressions(effects: Effect[], offset: number, length: number, time = 'T', move?: { dx: string; dy: string; zoom: string; rot: string } | null) {
  const tt = `(${time}+${offset.toFixed(4)})`, f = (n: number) => n.toFixed(5);
  const near = effects.filter(e => (e.kind === 'zoom' && e.mode !== 'hold' || e.kind === 'shake') && e.start < offset + length && e.start + e.duration > offset);
  // A segment is one clip: the held zooms that start in it frame it from their start until the next one starts, even
  // past their own block, and stop at the clip's end like the preview.
  const held = holdChain(effects, [offset, offset + length]);
  if (!near.length && !held.length && !move) return null;
  const steps: string[] = [], dxTerms: string[] = [], dyTerms: string[] = [];
  const pointExpr = (e: ZoomEffect, axis: 'x' | 'y') => {
    const subject = e.follow ? effects.find((v): v is HighlightEffect => v.kind === 'highlight' && v.id === e.follow) : undefined;
    if (!subject?.mask) return f(e[axis]);
    const mask = subject.mask, from = Math.max(e.start, mask.start), to = Math.min(e.start + e.duration, mask.start + mask.frames.length / mask.fps);
    if (to <= from) return f(e[axis]);
    // A smoothed trace sampled at 15 fps stays compact enough for FFmpeg while looking stable at 30 fps.
    const points: { t: number; v: number }[] = [];
    for (let t = from; t < to; t += 1 / 15) points.push({ t, v: trackedPointSmooth(subject, t)[axis] });
    points.push({ t: to, v: trackedPointSmooth(subject, to)[axis] });
    const segment = (i: number) => { const a = points[i], b = points[i + 1]; return `(${f(a.v)}+(${f(b.v - a.v)})*((${tt}-${f(a.t)})/${f(b.t - a.t)}))`; };
    // A balanced decision tree keeps FFmpeg's expression recursion shallow even for long tracked shots.
    const tree = (lo: number, hi: number): string => hi - lo <= 1 ? segment(lo) : (() => { const mid = Math.floor((lo + hi) / 2); return `if(lt(${tt},${f(points[mid].t)}),${tree(lo, mid)},${tree(mid, hi)})`; })();
    const expr = tree(0, points.length - 1);
    return `if(lt(${tt},${f(from)}),${f(e[axis])},${expr})`;
  };
  for (const { e, from } of held) {
    const s = f(e.start), p = easingExpression(e.easing ?? 'easeInOut', `min(1,max(0,(${tt}-${s})/${f(holdRamp(e))}))`, e.curve), x = pointExpr(e, 'x'), y = pointExpr(e, 'y');
    const toX = `((${x})*(1-${f(e.amount)}))`, toY = `((${y})*(1-${f(e.amount)}))`;
    steps.push(`st(4,${p})`, `st(0,if(gte(${tt},${s}),${f(from.z)}+(${f(e.amount - from.z)})*ld(4),ld(0)))`, `st(1,if(gte(${tt},${s}),${f(from.ox)}+(${toX}-${f(from.ox)})*ld(4),ld(1)))`, `st(2,if(gte(${tt},${s}),${f(from.oy)}+(${toY}-${f(from.oy)})*ld(4),ld(2)))`);
  }
  // Same combination as cameraAt: each zoom scales the framing so far around its own aim point. Built with ffmpeg's
  // expression variables (0: scale, 1 and 2: offset, 3: this zoom), so each zoom's formula appears once; nesting
  // them instead doubles the expression with every zoom.
  const apply = (z: string, x: string, y: string) => steps.push(`st(3,${z})`, 'st(0,ld(0)*ld(3))', `st(1,ld(3)*ld(1)+${x}*(1-ld(3)))`, `st(2,ld(3)*ld(2)+${y}*(1-ld(3)))`);
  for (const e of near) {
    const s = f(e.start), end = f(e.start + e.duration), u = `(${tt}-${s})`, on = `gte(${tt},${s})*lt(${tt},${end})`;
    if (e.kind === 'zoom') {
      const rise = ZOOM_IN(e.duration);
      const push = easingExpression(e.easing ?? 'easeOut', `${u}/${f(rise)}`, e.curve);
      const phase = `if(lt(${u},${f(rise)}),${push},(1+cos(PI*(${u}-${f(rise)})/${f(e.duration - rise)}))/2)`;
      apply(`(1+if(${on},${f(e.amount - 1)}*${phase},0))`, pointExpr(e, 'x'), pointExpr(e, 'y'));
    } else if (e.kind === 'shake') {
      const decay = `pow(1-${u}/${f(e.duration)},2)`;
      dxTerms.push(`if(${on},${f(e.strength)}*sin(2*PI*${SHAKE_X}*${u})*${decay},0)`);
      dyTerms.push(`if(${on},${f(e.strength * .8)}*sin(2*PI*${SHAKE_Y}*${u}+1.3)*${decay},0)`);
      apply(`(1+if(${on},${f(2.2 * e.strength)}*${decay},0))`, '0.5', '0.5');
    }
  }
  // A transition moves the framed picture around the frame's centre on top of the camera (variables 5 to 8: its zoom,
  // turn, and offset). The screen point is first taken back through that move, then through the camera.
  const moved = move ? [`st(5,${move.zoom})`, `st(6,${move.rot})`, `st(7,${move.dx})`, `st(8,${move.dy})`] : [];
  const prelude = ['st(0,1)', 'st(1,0)', 'st(2,0)', ...steps, ...moved].join(';');
  const dx = dxTerms.join('+') || '0', dy = dyTerms.join('+') || '0';
  const ux = (sx: string) => `((${sx})-W/2-ld(7)*W)/ld(5)`, uy = (sy: string) => `((${sy})-H/2-ld(8)*H)/ld(5)`;
  const back = move ? { x: (sx: string, sy: string) => `(W/2+${ux(sx)}*cos(ld(6))+${uy(sy)}*sin(ld(6)))`, y: (sx: string, sy: string) => `(H/2-${ux(sx)}*sin(ld(6))+${uy(sy)}*cos(ld(6)))` } : { x: (sx: string) => sx, y: (_: string, sy: string) => sy };
  // The source point shown at screen point S (in pixels, W and H the frame size): (S − offset) / scale, minus the shake.
  return { x: (sx: string, sy: string) => `${prelude};(${back.x(sx, sy)}-ld(1)*W)/ld(0)-(${dx})*W`, y: (sx: string, sy: string) => `${prelude};(${back.y(sx, sy)}-ld(2)*H)/ld(0)-(${dy})*H` };
}

/** Sensible starting settings for each preset, used by the editor's buttons. */
export function newEffect(kind: Effect['kind'], start: number, id: string, effects: Effect[] = []): Effect {
  if (kind === 'counter') return { id, kind, start, duration: 2.5, from: 0, to: 1000000, prefix: '', suffix: ' ROBUX', format: 'full', x: .5, y: .45, size: .11, color: '#ffd84d', font: 'luckiest', countDelay: 0, countDuration: 1.5, easing: 'easeOut', entrance: 'none', bounce: false, decimals: 0, separators: true };
  if (kind === 'zoom') {
    const current = heldAt(effects, start);
    const focus = (offset: number) => Math.abs(1 - current.z) > 1e-6 ? clamp01(offset / (1 - current.z)) : .5;
    return { id, kind, start, duration: .6, mode: 'hold', rampDuration: .6, easing: 'easeInOut', amount: Math.min(2.5, Math.round((current.z + .35) * 100) / 100), x: focus(current.ox), y: focus(current.oy) };
  }
  if (kind === 'shake') return { id, kind, start, duration: .45, strength: .025 };
  if (kind === 'highlight') return { id, kind, start, duration: 2, x: .5, y: .5, w: .3, h: .35, color: '#3ddc84', shape: 'ellipse', style: 'tint' };
  if (kind === 'blur') return { id, kind, start, duration: 3, x: .2, y: .12, w: .3, h: .12, style: 'blur', strength: .6 };
  if (kind === 'bar') return { id, kind, start, duration: 2.5, x: .5, y: .86, w: .6, h: .055, from: 0, to: 100, easing: 'easeOut', color: '#4ce07a', back: '#1b1f2a', label: 'XP', showValue: true };
  return { id, kind, start, duration: .35, color: '#ffffff' };
}
export const EFFECT_LABELS: Record<Effect['kind'], string> = { counter: 'Counter', zoom: 'Zoom', shake: 'Shake', flash: 'Flash', highlight: 'Highlight', blur: 'Blur', bar: 'Progress bar' };
