/** One curve definition drives the picker, preview and FFmpeg expressions. */
export const EASINGS = [
  { id: 'linear', label: 'Linear', hint: 'Constant speed', group: 'Smooth' },
  { id: 'easeIn', label: 'Ease in', hint: 'Build up speed', group: 'Smooth' },
  { id: 'easeOut', label: 'Ease out', hint: 'Fast start, soft landing', group: 'Smooth' },
  { id: 'easeInOut', label: 'Smooth', hint: 'Soft start and finish', group: 'Smooth' },
  { id: 'sineIn', label: 'Gentle in', hint: 'Gradual acceleration', group: 'Smooth' },
  { id: 'sineOut', label: 'Gentle out', hint: 'Gradual slowdown', group: 'Smooth' },
  { id: 'sineInOut', label: 'Gentle S', hint: 'Subtle cinematic motion', group: 'Smooth' },
  { id: 'smoother', label: 'Silky S', hint: 'Extra-soft endpoints', group: 'Smooth' },
  { id: 'cubicInOut', label: 'Strong S', hint: 'More speed in the middle', group: 'Dramatic' },
  { id: 'quartInOut', label: 'Sharp S', hint: 'Slow edges, quick middle', group: 'Dramatic' },
  { id: 'expoIn', label: 'Rush in', hint: 'Build to a fast finish', group: 'Dramatic' },
  { id: 'expoOut', label: 'Snap out', hint: 'Quick move, long settle', group: 'Dramatic' },
  { id: 'expoInOut', label: 'Impact S', hint: 'Hold back, rush, settle', group: 'Dramatic' },
  { id: 'circInOut', label: 'Circular S', hint: 'A steep central sweep', group: 'Dramatic' },
  { id: 'backOut', label: 'Overshoot', hint: 'Pass the target, settle back', group: 'Playful', overshoot: true },
  { id: 'elasticOut', label: 'Spring', hint: 'Elastic oscillation', group: 'Playful', overshoot: true },
  { id: 'bounceOut', label: 'Bounce', hint: 'Land with diminishing bounces', group: 'Playful', overshoot: true },
  { id: 'custom', label: 'Custom', hint: 'Shape your own Bézier curve', group: 'Custom' },
] as const;
export type Easing = typeof EASINGS[number]['id'];
export type Bezier = [number, number, number, number];
export const DEFAULT_BEZIER: Bezier = [.25, .1, .25, 1];
export const isEasing = (v: unknown): v is Easing => EASINGS.some(e => e.id === v);
export function validateBezier(value: unknown): Bezier | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 4 || !value.every((v, i) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= (i % 2 ? 1.5 : 1))) throw new Error('A Bézier curve needs four valid control coordinates.');
  return [...value] as Bezier;
}
type Node = number | 'p' | { op: string; args: Node[] };
const node = (op: string, ...args: Node[]): Node => ({ op, args });
const add = (...v: Node[]) => node('+', ...v), sub = (a: Node, b: Node) => node('-', a, b), mul = (...v: Node[]) => node('*', ...v), div = (a: Node, b: Node) => node('/', a, b), pow = (a: Node, b: Node) => node('pow', a, b), lt = (a: Node, b: Node) => node('lt', a, b), choose = (c: Node, a: Node, b: Node) => node('if', c, a, b);
const p: Node = 'p', inv = sub(1, p), twice = mul(2, p);
const bounce = (offset: number, floor: number) => add(mul(7.5625, pow(sub(p, offset), 2)), floor);
const curves: Record<Exclude<Easing, 'custom'>, Node> = {
  linear: p, easeIn: pow(p, 3), easeOut: sub(1, pow(inv, 3)), easeInOut: mul(p, p, sub(3, twice)),
  sineIn: sub(1, node('cos', mul(p, Math.PI / 2))), sineOut: node('sin', mul(p, Math.PI / 2)), sineInOut: div(sub(1, node('cos', mul(p, Math.PI))), 2),
  smoother: mul(pow(p, 3), add(mul(p, sub(mul(6, p), 15)), 10)),
  cubicInOut: choose(lt(p, .5), mul(4, pow(p, 3)), sub(1, div(pow(sub(2, twice), 3), 2))),
  quartInOut: choose(lt(p, .5), mul(8, pow(p, 4)), sub(1, div(pow(sub(2, twice), 4), 2))),
  expoIn: pow(2, sub(mul(10, p), 10)), expoOut: sub(1, pow(2, mul(-10, p))),
  expoInOut: choose(lt(p, .5), div(pow(2, sub(mul(20, p), 10)), 2), div(sub(2, pow(2, add(mul(-20, p), 10))), 2)),
  circInOut: choose(lt(p, .5), div(sub(1, node('sqrt', node('max', 0, sub(1, pow(twice, 2))))), 2), div(add(node('sqrt', node('max', 0, sub(1, pow(sub(2, twice), 2)))), 1), 2)),
  backOut: add(1, mul(2.70158, pow(sub(p, 1), 3)), mul(1.70158, pow(sub(p, 1), 2))),
  elasticOut: add(1, mul(pow(2, mul(-10, p)), node('sin', mul(sub(mul(10, p), .75), 2 * Math.PI / 3)))),
  bounceOut: choose(lt(p, 1 / 2.75), bounce(0, 0), choose(lt(p, 2 / 2.75), bounce(1.5 / 2.75, .75), choose(lt(p, 2.5 / 2.75), bounce(2.25 / 2.75, .9375), bounce(2.625 / 2.75, .984375)))),
};
function evaluate(n: Node, progress: number): number {
  if (typeof n === 'number') return n; if (n === 'p') return progress;
  if (n.op === 'if') return evaluate(n.args[evaluate(n.args[0], progress) ? 1 : 2], progress);
  const a = n.args.map(v => evaluate(v, progress));
  switch (n.op) { case '+': return a.reduce((x, y) => x + y); case '-': return a[0] - a[1]; case '*': return a.reduce((x, y) => x * y); case '/': return a[0] / a[1]; case 'pow': return Math.pow(a[0], a[1]); case 'sin': return Math.sin(a[0]); case 'cos': return Math.cos(a[0]); case 'sqrt': return Math.sqrt(a[0]); case 'max': return Math.max(...a); case 'lt': return +(a[0] < a[1]); default: throw new Error('Unknown curve operation.'); }
}
function compile(n: Node, progress: string): string {
  if (typeof n === 'number') return String(n); if (n === 'p') return `(${progress})`;
  const a = n.args.map(v => compile(v, progress));
  return ['+', '-', '*', '/'].includes(n.op) ? `(${a.join(n.op)})` : `${n.op}(${a.join(',')})`;
}
// Sample Bézier y at uniformly spaced x, solving x(t) rather than mistaking t for time.
// Both renderers use the same 64-segment interpolation, keeping custom curves compact in FFmpeg.
const tableCache = new Map<string, number[]>(), STEPS = 64;
function bezierTable(curve: Bezier) {
  const key = curve.join(','); const found = tableCache.get(key); if (found) return found;
  const cubic = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  const values = Array.from({ length: STEPS + 1 }, (_, i) => { if (!i || i === STEPS) return i / STEPS; let low = 0, high = 1; for (let j = 0; j < 40; j++) { const t = (low + high) / 2; if (cubic(t, curve[0], curve[2]) < i / STEPS) low = t; else high = t; } return cubic((low + high) / 2, curve[1], curve[3]); });
  if (tableCache.size >= 100) tableCache.delete(tableCache.keys().next().value!); tableCache.set(key, values); return values;
}
function definition(easing: Easing, counter: boolean) { return counter && easing === 'easeOut' ? sub(1, pow(inv, 4)) : curves[easing as Exclude<Easing, 'custom'>]; }
export function easeAt(easing: Easing, progress: number, curve = DEFAULT_BEZIER, counter = false) {
  const t = Math.max(0, Math.min(1, progress)); if (t === 0 || t === 1) return t;
  if (easing !== 'custom') return evaluate(definition(easing, counter), t);
  const values = bezierTable(curve), index = Math.min(STEPS - 1, Math.floor(t * STEPS)), fraction = t * STEPS - index;
  return values[index] + fraction * (values[index + 1] - values[index]);
}
export function easingExpression(easing: Easing, progress: string, curve = DEFAULT_BEZIER) {
  const t = `min(1,max(0,${progress}))`;
  if (easing !== 'custom') return `if(lte(${t},0),0,if(gte(${t},1),1,${compile(definition(easing, false), t)}))`;
  const values = bezierTable(curve), branches = values.slice(0, -1).map((value, i) => `${value.toFixed(9)}+(ld(9)-${i / STEPS})*${((values[i + 1] - value) * STEPS).toFixed(9)}`);
  let result = branches[STEPS - 1]; for (let i = STEPS - 2; i >= 0; i--) result = `if(lt(ld(9),${(i + 1) / STEPS}),${branches[i]},${result})`;
  // Register 9 is reserved for curve sampling; camera composition owns registers 0–4.
  return `(st(9,${t});${result})`;
}
