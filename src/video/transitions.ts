import type { Clip } from './model';

/**
 * Transitions between clips, CapCut style. Clips play one after the other, so a transition is the end of the outgoing
 * clip and the start of the incoming one moving as a pair across the cut: the old shot whips out to the left as the
 * new one whips in from the right, both smeared by motion blur, so the eye reads one continuous move. Each also zooms
 * in just enough while it moves that the frame's edges never show.
 * Pure functions: the preview (footage.ts) and the export (motion.ts expressions, render.ts) read the same curves.
 */
export const TRANSITION_KINDS = ['whip', 'slide', 'zoom', 'spin', 'glitch', 'flash'] as const;
/** `sound`: a built-in sound for the cut; left out, the kind's own (TRANSITION_SOUNDS); null, silent. */
export type Transition = { kind: (typeof TRANSITION_KINDS)[number]; duration: number; sound?: string | null };
export const TRANSITIONS: { id: Transition['kind']; label: string; hint: string }[] = [
  { id: 'whip', label: 'Whip pan', hint: 'A fast sideways swish' },
  { id: 'slide', label: 'Swipe up', hint: 'The next shot pushes up from below' },
  { id: 'zoom', label: 'Zoom through', hint: 'Punch in through the cut' },
  { id: 'spin', label: 'Spin', hint: 'Twist into the next shot' },
  { id: 'glitch', label: 'Glitch', hint: 'A digital error for a frame or two' },
  { id: 'flash', label: 'Flash cut', hint: 'A white flash on the cut' },
];
/** Built-in sound each transition suggests (sounds.ts). */
export const TRANSITION_SOUNDS: Record<Transition['kind'], string> = { whip: 'whoosh', slide: 'swing', zoom: 'whoosh', spin: 'swing', glitch: 'camera-shutter', flash: 'camera-shutter' };

/** The picture's extra move at a moment: offset as shares of the frame, zoom, turn in radians, and how strong the
 * motion blur, glitch and white flash are (0 to 1). */
export type TransitionState = { dx: number; dy: number; zoom: number; rot: number; blur: number; glitch: number; flash: number };
export const STILL: TransitionState = { dx: 0, dy: 0, zoom: 1, rot: 0, blur: 0, glitch: 0, flash: 0 };

/**
 * The move for one side of a cut. `q` runs from 0 at the edge of the transition window to 1 at the cut itself;
 * `side` is -1 for the outgoing clip and 1 for the incoming one.
 */
function shape(kind: Transition['kind'], q: number, side: -1 | 1): TransitionState {
  const fast = q * q;
  switch (kind) {
    case 'whip': return { ...STILL, dx: -side * .35 * fast, zoom: 1 + .8 * q, blur: q };
    case 'slide': return { ...STILL, dy: -side * .35 * fast, zoom: 1 + .8 * q, blur: q };
    case 'zoom': return { ...STILL, zoom: 1 + 1.5 * fast, blur: q };
    case 'spin': return { ...STILL, rot: side * .9 * fast, zoom: 1 + 1.6 * q, blur: q };
    case 'glitch': return { ...STILL, zoom: 1 + .06 * q, glitch: q > .15 ? q : 0 };
    case 'flash': return { ...STILL, zoom: 1 + .08 * q, flash: q ** 1.5 };
  }
}

/** The transition move on a clip at `u` seconds into it. `next` is the clip after it, whose transition ends this one. */
export function transitionAt(clip: Clip, next: Clip | undefined, length: number, u: number): TransitionState {
  const into = clip.transition, out = next?.transition;
  if (into) { const half = Math.min(into.duration / 2, length / 2); if (u < half) return shape(into.kind, 1 - u / half, 1); }
  if (out) { const half = Math.min(out.duration / 2, length / 2); if (u > length - half) return shape(out.kind, 1 - (length - u) / half, -1); }
  return STILL;
}

/**
 * The same move as ffmpeg expressions of segment time `T` (seconds into the clip), for the export: one string per
 * value, each 0 or 1 outside the windows. `windows` are the stretches with motion blur or glitch, to switch those on.
 */
export function transitionExpressions(clip: Clip, next: Clip | undefined, length: number, T = 'T') {
  const into = clip.transition, out = next?.transition, f = (n: number) => n.toFixed(5);
  if (!into && !out) return null;
  const parts = { dx: [] as string[], dy: [] as string[], zoom: [] as string[], rot: [] as string[] }, blur: [number, number][] = [], glitch: [number, number][] = [];
  const add = (kind: Transition['kind'], from: number, to: number, side: -1 | 1) => {
    // q: 0 at the window's far edge, 1 at the cut.
    const q = side === 1 ? `(1-(${T})/${f(to)})` : `(1-(${f(length)}-(${T}))/${f(to - from)})`, on = `gte(${T},${f(from)})*lt(${T},${f(to)})`;
    const term = (key: keyof typeof parts, expr: string) => parts[key].push(`${on}*(${expr})`);
    const fast = `pow(${q},2)`;
    if (kind === 'whip') { term('dx', `${-side * .35}*${fast}`); term('zoom', `.8*${q}`); blur.push([from, to]); }
    if (kind === 'slide') { term('dy', `${-side * .35}*${fast}`); term('zoom', `.8*${q}`); blur.push([from, to]); }
    if (kind === 'zoom') { term('zoom', `1.5*${fast}`); blur.push([from, to]); }
    if (kind === 'spin') { term('rot', `${side * .9}*${fast}`); term('zoom', `1.6*${q}`); blur.push([from, to]); }
    if (kind === 'glitch') { term('zoom', `.06*${q}`); glitch.push([side === 1 ? from : from + (to - from) * .15, side === 1 ? to - (to - from) * .15 : to]); }
    if (kind === 'flash') term('zoom', `.08*${q}`);
  };
  if (into) add(into.kind, 0, Math.min(into.duration / 2, length / 2), 1);
  if (out) { const half = Math.min(out.duration / 2, length / 2); add(out.kind, length - half, length, -1); }
  const sum = (list: string[], base: string) => list.length ? `(${base}+${list.join('+')})` : base;
  return { dx: sum(parts.dx, '0'), dy: sum(parts.dy, '0'), zoom: sum(parts.zoom, '1'), rot: sum(parts.rot, '0'), blur, glitch };
}
