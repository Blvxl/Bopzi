/**
 * Every shape a shape layer can be. Boxes and ellipses are drawn as such; the rest are outlines written on a
 * 100 × 100 grid and stretched to the layer's size, so one definition serves any size and proportion.
 * Paths use absolute M L H V C Q A Z only, which is all `scalePath` understands.
 */

export type ShapeGroup = 'Game UI' | 'Arrows' | 'Basic' | 'Badges' | 'Icons' | 'Timers' | 'Effects';
export type ShapeDef = {
  id: string;
  label: string;
  group: ShapeGroup;
  /** A `widget` is painted by studio/widgets.ts instead of being one flat outline. */
  kind: 'rect' | 'ellipse' | 'path' | 'widget';
  d?: string;
  /** Holes are cut where outlines overlap, the way a ring or a coin needs. */
  evenodd?: boolean;
  /** Width over height it is first added at. */
  ratio?: number;
};

const n = (v: number) => Math.round(v * 100) / 100;
const at = (angle: number, r: number) => `${n(50 + Math.cos(angle) * r)} ${n(50 + Math.sin(angle) * r)}`;

/** A star or a burst: points alternating between the edge and `inner` of the way in. */
function star(points: number, inner: number) {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) parts.push(`${i ? 'L' : 'M'}${at(-Math.PI / 2 + (i * Math.PI) / points, i % 2 ? 50 * inner : 50)}`);
  return `${parts.join(' ')} Z`;
}

/** Wedges fanning out from the middle: the sunburst behind a prize. */
function rays(count: number) {
  const step = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => `M50 50 L${at(i * step, 72)} L${at(i * step + step / 2, 72)} Z`).join(' ');
}

/** Thin streaks pointing at the middle and stopping short of it: speed, impact. */
function streaks(count: number) {
  const step = (Math.PI * 2) / count;
  return Array.from({ length: count }, (_, i) => {
    // Uneven lengths, the same every time.
    const reach = 22 + ((i * 37) % 17);
    const half = step * (0.1 + ((i * 13) % 5) * 0.03);
    return `M${at(i * step, reach)} L${at(i * step - half, 72)} L${at(i * step + half, 72)} Z`;
  }).join(' ');
}

/** A burst with uneven points, as a hand-drawn impact has. The same every time. */
function jagged(points: number, radius: number, inner: number) {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const reach = i % 2 ? radius * inner * (0.8 + ((i * 7) % 5) * 0.08) : radius * (0.62 + ((i * 11) % 7) * 0.063);
    parts.push(`${i ? 'L' : 'M'}${at(-Math.PI / 2 + (i * Math.PI) / points, reach)}`);
  }
  return `${parts.join(' ')} Z`;
}

const DISC = 'M50 4 A46 46 0 1 0 50 96 A46 46 0 1 0 50 4 Z';
const TILE = 'M24 4 H76 Q96 4 96 24 V76 Q96 96 76 96 H24 Q4 96 4 76 V24 Q4 4 24 4 Z';

const BARS = 'M10 4 H90 V14 H10 Z M10 86 H90 V96 H10 Z';

export const SHAPES: ShapeDef[] = [
  { id: 'bar', label: 'Bar', group: 'Game UI', kind: 'widget', ratio: 7 },
  { id: 'button', label: 'Button', group: 'Game UI', kind: 'widget', ratio: 2.8 },
  { id: 'panel', label: 'Prompt plate', group: 'Game UI', kind: 'widget', ratio: 3 },
  { id: 'keycap', label: 'Key', group: 'Game UI', kind: 'widget' },
  { id: 'key-ring', label: 'Key ring', group: 'Game UI', kind: 'widget' },
  { id: 'cursor', label: 'Cursor', group: 'Game UI', kind: 'path', ratio: 0.72, d: 'M12 4 L12 82 L32 64 L46 96 L62 89 L48 58 L76 58 Z' },
  { id: 'play', label: 'Play', group: 'Game UI', kind: 'path', ratio: 0.9, d: 'M14 6 Q14 0 20 3 L92 45 Q98 50 92 55 L20 97 Q14 100 14 94 Z' },
  { id: 'pause', label: 'Pause', group: 'Game UI', kind: 'path', ratio: 0.7, d: 'M4 6 Q4 0 10 0 H30 Q36 0 36 6 V94 Q36 100 30 100 H10 Q4 100 4 94 Z M64 6 Q64 0 70 0 H90 Q96 0 96 6 V94 Q96 100 90 100 H70 Q64 100 64 94 Z' },
  // Roblox's own on-screen controls. `d` is only how they are pictured on their button.
  { id: 'ui-jump', label: 'Jump button', group: 'Game UI', kind: 'widget', d: DISC },
  { id: 'ui-stick', label: 'Thumbstick', group: 'Game UI', kind: 'widget', d: DISC },
  { id: 'ui-chat', label: 'Chat button', group: 'Game UI', kind: 'widget', d: TILE },
  { id: 'ui-menu', label: 'Menu button', group: 'Game UI', kind: 'widget', d: TILE },
  { id: 'ui-mic', label: 'Voice chat', group: 'Game UI', kind: 'widget', d: TILE },
  { id: 'ui-mic-off', label: 'Voice chat, muted', group: 'Game UI', kind: 'widget', d: TILE },

  // Arrows the way thumbnails draw them: one flat colour, fat, with a sweeping tail. All original outlines.
  { id: 'arrow-swoosh', label: 'Swoosh arrow', group: 'Arrows', kind: 'path', ratio: 1.35, d: 'M2 68 C22 80 46 66 64 38 L50 26 L96 6 L86 64 L80 56 C62 92 24 96 2 68 Z' },
  { id: 'arrow-curve', label: 'Curved arrow', group: 'Arrows', kind: 'path', ratio: 1.9, d: 'M2 60 C8 36 34 20 62 18 L62 4 L98 28 L62 52 L62 38 C40 38 16 44 2 60 Z' },
  { id: 'arrow-hook', label: 'Rising arrow', group: 'Arrows', kind: 'path', ratio: 0.95, d: 'M4 96 C40 92 60 70 62 30 L50 30 L74 2 L98 30 L86 30 C88 74 52 98 4 96 Z' },
  { id: 'arrow-up', label: 'Fat arrow', group: 'Arrows', kind: 'path', ratio: 0.9, d: 'M50 4 L94 48 Q98 54 90 56 H68 V92 Q68 96 64 96 H36 Q32 96 32 92 V56 H10 Q2 54 6 48 Z' },
  { id: 'arrow-thin', label: 'Thin arrow', group: 'Arrows', kind: 'path', ratio: 0.45, d: 'M50 2 L76 36 H58 V96 Q58 98 56 98 H44 Q42 98 42 96 V36 H24 Z' },
  { id: 'exclaim', label: 'Exclamation mark', group: 'Arrows', kind: 'path', ratio: 0.42, d: 'M26 4 H74 L62 66 H38 Z M38 76 H62 Q70 76 70 83 V91 Q70 98 62 98 H38 Q30 98 30 91 V83 Q30 76 38 76 Z' },
  { id: 'exclaim-block', label: 'Block exclamation', group: 'Arrows', kind: 'path', ratio: 0.36, d: 'M28 4 H72 V68 H28 Z M28 78 H72 V98 H28 Z' },
  // A sliver of light, laid over a cartoon shape near its top-left edge.
  { id: 'glint', label: 'Glint', group: 'Arrows', kind: 'path', ratio: 0.4, d: 'M30 6 L72 2 L50 90 Q46 98 40 92 Z' },

  { id: 'rect', label: 'Box', group: 'Basic', kind: 'rect', ratio: 1.6 },
  { id: 'ellipse', label: 'Circle', group: 'Basic', kind: 'ellipse' },
  { id: 'ring', label: 'Ring', group: 'Basic', kind: 'path', evenodd: true, d: 'M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 13 A37 37 0 1 0 50 87 A37 37 0 1 0 50 13 Z' },
  { id: 'triangle', label: 'Triangle', group: 'Basic', kind: 'path', d: 'M50 6 L96 92 H4 Z' },
  { id: 'star', label: 'Star', group: 'Basic', kind: 'path', d: star(5, 0.42) },
  { id: 'arrow', label: 'Block arrow', group: 'Basic', kind: 'path', ratio: 1.4, d: 'M4 34 H58 V10 L96 50 L58 90 V66 H4 Z' },
  { id: 'plus', label: 'Plus', group: 'Basic', kind: 'path', d: 'M38 6 H62 V38 H94 V62 H62 V94 H38 V62 H6 V38 H38 Z' },
  { id: 'cross', label: 'Cross', group: 'Basic', kind: 'path', d: 'M20 6 L50 36 L80 6 L94 20 L64 50 L94 80 L80 94 L50 64 L20 94 L6 80 L36 50 L6 20 Z' },
  { id: 'check', label: 'Tick', group: 'Basic', kind: 'path', d: 'M8 54 L24 38 L42 56 L78 14 L94 30 L42 88 Z' },

  { id: 'burst', label: 'Burst', group: 'Badges', kind: 'path', d: star(14, 0.8) },
  { id: 'spiky', label: 'Spiky burst', group: 'Badges', kind: 'path', d: star(10, 0.62) },
  { id: 'ribbon', label: 'Ribbon', group: 'Badges', kind: 'path', ratio: 3.2, d: 'M0 14 H100 L90 50 L100 86 H0 L10 50 Z' },
  { id: 'bubble', label: 'Speech bubble', group: 'Badges', kind: 'path', ratio: 1.3, d: 'M16 6 H84 A12 12 0 0 1 96 18 V58 A12 12 0 0 1 84 70 H46 L24 94 L28 70 H16 A12 12 0 0 1 4 58 V18 A12 12 0 0 1 16 6 Z' },
  { id: 'shield', label: 'Shield', group: 'Badges', kind: 'path', ratio: 0.9, d: 'M50 4 L90 18 V48 C90 72 72 90 50 98 C28 90 10 72 10 48 V18 Z' },

  { id: 'coin', label: 'Coin', group: 'Icons', kind: 'path', evenodd: true, d: 'M50 2 A48 48 0 1 0 50 98 A48 48 0 1 0 50 2 Z M50 15 A35 35 0 1 0 50 85 A35 35 0 1 0 50 15 Z M50 22 A28 28 0 1 0 50 78 A28 28 0 1 0 50 22 Z' },
  { id: 'gem', label: 'Gem', group: 'Icons', kind: 'path', ratio: 1.1, d: 'M26 10 H74 L96 38 L50 94 L4 38 Z' },
  { id: 'heart', label: 'Heart', group: 'Icons', kind: 'path', ratio: 1.1, d: 'M50 92 C20 68 4 50 4 31 C4 15 16 6 28 6 C38 6 46 12 50 21 C54 12 62 6 72 6 C84 6 96 15 96 31 C96 50 80 68 50 92 Z' },
  { id: 'bolt', label: 'Lightning', group: 'Icons', kind: 'path', ratio: 0.75, d: 'M58 2 L16 56 H44 L36 98 L84 40 H54 Z' },
  { id: 'crown', label: 'Crown', group: 'Icons', kind: 'path', ratio: 1.2, d: 'M8 78 L4 26 L30 48 L50 14 L70 48 L96 26 L92 78 Z M10 84 H90 V96 H10 Z' },
  { id: 'flame', label: 'Flame', group: 'Icons', kind: 'path', ratio: 0.8, d: 'M50 2 C58 22 82 34 82 62 C82 82 68 98 50 98 C32 98 18 82 18 62 C18 48 26 38 34 30 C36 42 42 46 46 44 C40 30 44 14 50 2 Z' },
  { id: 'lock', label: 'Lock', group: 'Icons', kind: 'path', ratio: 0.85, d: 'M20 44 H80 A8 8 0 0 1 88 52 V88 A8 8 0 0 1 80 96 H20 A8 8 0 0 1 12 88 V52 A8 8 0 0 1 20 44 Z M28 44 V30 A22 22 0 0 1 72 30 V44 H60 V30 A10 10 0 0 0 40 30 V44 Z' },
  { id: 'sword', label: 'Sword', group: 'Icons', kind: 'path', d: 'M82 4 H96 V18 L46 68 L52 74 L44 82 L34 72 L18 88 L22 92 L14 98 L2 86 L8 78 L12 82 L28 66 L18 56 L26 48 L32 54 Z' },

  // An hourglass over a number is how update countdowns are shown on game icons.
  { id: 'hourglass', label: 'Hourglass', group: 'Timers', kind: 'path', evenodd: true, ratio: 0.72, d: `${BARS} M18 14 H82 V20 C82 40 60 46 56 50 C60 54 82 60 82 80 V86 H18 V80 C18 60 40 54 44 50 C40 46 18 40 18 20 Z M27 20 H73 C73 36 56 42 50 46 C44 42 27 36 27 20 Z M27 80 C27 64 44 58 50 54 C56 58 73 64 73 80 Z M38 30 H62 C60 36 54 40 50 43 C46 40 40 36 38 30 Z M32 80 C34 70 44 66 50 62 C56 66 66 70 68 80 Z` },
  { id: 'hourglass-blocky', label: 'Blocky hourglass', group: 'Timers', kind: 'path', evenodd: true, ratio: 0.72, d: `${BARS} M18 14 H82 V24 L58 50 L82 76 V86 H18 V76 L42 50 L18 24 Z M28 20 H72 V22 L50 44 L28 22 Z M28 80 V78 L50 56 L72 78 V80 Z M38 28 H62 L50 40 Z M34 80 L50 64 L66 80 Z` },
  { id: 'hourglass-solid', label: 'Solid hourglass', group: 'Timers', kind: 'path', ratio: 0.72, d: `${BARS} M20 18 H80 C80 38 60 44 55 50 C60 56 80 62 80 82 H20 C20 62 40 56 45 50 C40 44 20 38 20 18 Z` },
  { id: 'clock', label: 'Clock', group: 'Timers', kind: 'path', evenodd: true, d: 'M50 2 A48 48 0 1 0 50 98 A48 48 0 1 0 50 2 Z M45 20 H55 V47 L72 60 L66 68 L45 53 Z' },

  // Painted effects: `d` is only how they are pictured on their button.
  { id: 'sunrays', label: 'Sun rays', group: 'Effects', kind: 'widget', d: rays(12) },
  { id: 'speedlines', label: 'Speed lines', group: 'Effects', kind: 'widget', ratio: 16 / 9, d: streaks(30) },
  { id: 'vignette', label: 'Vignette', group: 'Effects', kind: 'widget', ratio: 16 / 9, d: 'M0 0 H100 V100 H0 Z M50 12 A38 38 0 1 0 50 88 A38 38 0 1 0 50 12 Z', evenodd: true },
  { id: 'blob', label: 'Ground shadow', group: 'Effects', kind: 'widget', ratio: 4.5, d: 'M50 30 A48 20 0 1 0 50 70 A48 20 0 1 0 50 30 Z' },
  { id: 'spotlight', label: 'Spotlight', group: 'Effects', kind: 'widget', ratio: 0.8, d: 'M36 2 H64 L96 98 H4 Z' },
  { id: 'rays', label: 'Flat sunburst', group: 'Effects', kind: 'path', d: rays(12) },
  { id: 'streaks', label: 'Flat streaks', group: 'Effects', kind: 'path', d: streaks(30) },
  { id: 'impact', label: 'Impact', group: 'Effects', kind: 'path', evenodd: true, d: `${jagged(18, 50, 0.52)} ${jagged(18, 30, 0.6)}` },
  { id: 'swoosh', label: 'Swoosh', group: 'Effects', kind: 'path', ratio: 2.2, d: 'M2 12 C28 74 72 82 98 40 C68 62 30 52 2 12 Z' },
  // Four-point sparkles: the fat one for clusters, the thin one for a single glint.
  { id: 'sparkle', label: 'Sparkle', group: 'Effects', kind: 'path', d: 'M50 0 C54 30 70 46 100 50 C70 54 54 70 50 100 C46 70 30 54 0 50 C30 46 46 30 50 0 Z' },
  { id: 'sparkle-thin', label: 'Thin sparkle', group: 'Effects', kind: 'path', ratio: 0.7, d: 'M50 0 C52 38 60 46 100 50 C60 54 52 62 50 100 C48 62 40 54 0 50 C40 46 48 38 50 0 Z' },
];

const BOX = SHAPES.find((s) => s.id === 'rect')!;
export const shapeOf = (id: string) => SHAPES.find((s) => s.id === id) ?? BOX;

const scaled = new Map<string, string>();

/** A 100 × 100 outline stretched to `w` by `h`. */
export function scalePath(d: string, w: number, h: number) {
  const key = `${w}|${h}|${d}`;
  const hit = scaled.get(key);
  if (hit) return hit;
  const sx = w / 100, sy = h / 100;
  const out = d.replace(/([MLHVCQAZ])([^MLHVCQAZ]*)/g, (_, cmd: string, rest: string) => {
    const v = rest.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === 'Z') return 'Z ';
    if (cmd === 'H') return `H${n(v[0] * sx)} `;
    if (cmd === 'V') return `V${n(v[0] * sy)} `;
    // An arc: two radii, a rotation and two flags that are not coordinates, then the end point.
    if (cmd === 'A') return `A${n(v[0] * sx)} ${n(v[1] * sy)} ${v[2]} ${v[3]} ${v[4]} ${n(v[5] * sx)} ${n(v[6] * sy)} `;
    return `${cmd}${v.map((value, i) => n(value * (i % 2 ? sy : sx))).join(' ')} `;
  });
  if (scaled.size > 400) scaled.clear();
  scaled.set(key, out);
  return out;
}
