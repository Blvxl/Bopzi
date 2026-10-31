import type { PoseName } from './prompt';

/**
 * A blocky Roblox mannequin drawn in true 3D, so the image model gets a real pose, camera and grip to follow.
 * Roblox only serves avatar meshes to signed-in users, so identity still comes from the avatar image.
 * Local axes: +x is the figure's left, +y up, +z forward. Drawn as flat-shaded faces, with no 3D dependency.
 */

type V = [number, number, number];
type M = [number, number, number, number, number, number, number, number, number];
type Limb = { upper: V; lower: number };
type Pose = {
  body: V; head: V; armL: Limb; armR: Limb; legL: Limb; legR: Limb;
  /** Camera turn and tilt in degrees, and how far along the frame (0 to 1) the figure stands. */
  yaw: number; pitch: number; at: number;
  tool?: boolean;
};

const WIDTH = 1536, HEIGHT = 864;
// The limbs on the camera's side are lighter than the far ones, so the model can tell them apart.
const BODY = '#aeb6c0', NEAR = '#d3d8de', FAR = '#7d8693', TOOL = '#f08a24', MARK = '#2f353d', BACKDROP = '#eef0f3';
const rad = (d: number) => d * Math.PI / 180;

const POSES: Record<PoseName, Pose> = {
  swing: { body: [16, 76, 0], head: [-8, 6, 0], armL: { upper: [-84, 0, -20], lower: -14 }, armR: { upper: [-46, 0, 20], lower: -26 }, legL: { upper: [-46, 0, 3], lower: 26 }, legR: { upper: [36, 0, -3], lower: 12 }, yaw: 0, pitch: 5, at: 0.38, tool: true },
  run: { body: [20, 76, 0], head: [-14, 6, 0], armL: { upper: [52, 0, 4], lower: -66 }, armR: { upper: [-72, 0, -4], lower: -62 }, legL: { upper: [-72, 0, 2], lower: 42 }, legR: { upper: [46, 0, -2], lower: 74 }, yaw: 0, pitch: 5, at: 0.5 },
  jump: { body: [-6, 74, 0], head: [10, 6, 0], armL: { upper: [-146, 0, -10], lower: -10 }, armR: { upper: [-166, 0, 10], lower: -10 }, legL: { upper: [-22, 0, 3], lower: 58 }, legR: { upper: [-74, 0, -3], lower: 88 }, yaw: 0, pitch: 8, at: 0.5 },
  point: { body: [0, 62, 0], head: [0, 24, 0], armL: { upper: [-8, 0, -6], lower: -14 }, armR: { upper: [-90, -14, 0], lower: 0 }, legL: { upper: [-16, 0, 4], lower: 6 }, legR: { upper: [14, 0, -4], lower: 4 }, yaw: 0, pitch: 4, at: 0.34 },
};

const rotX = (a: number): M => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a: number): M => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a: number): M => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const times = (a: M, b: M): M => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[c + 3] + a[r * 3 + 2] * b[c + 6])) as M;
const turn = (e: V) => times(rotY(rad(e[1])), times(rotX(rad(e[0])), rotZ(rad(e[2]))));
const apply = (m: M, v: V): V => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V, n: number): V => [a[0] * n, a[1] * n, a[2] * n];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => scale(a, 1 / Math.hypot(...a));

type Box = { at: V; size: V; m: M; colour: string };
// Each face lists its corners anticlockwise as seen from outside.
const FACES = [[1, 3, 7, 5], [4, 6, 2, 0], [2, 6, 7, 3], [4, 0, 1, 5], [5, 7, 6, 4], [0, 2, 3, 1]];

function figure(p: Pose) {
  const boxes: Box[] = [];
  const hands: V[] = [];
  const body = turn(p.body);
  const place = (origin: V, m: M, at: V, size: V, colour = BODY) => boxes.push({ at: add(origin, apply(m, at)), size, m, colour });
  place([0, 0, 0], body, [0, 1, 0], [2, 2, 1]);
  const neck = apply(body, [0, 2, 0]);
  const head = times(body, turn(p.head));
  place(neck, head, [0, 0.62, 0], [1.25, 1.25, 1.25]);
  // A dark band on the front of the head shows which way it faces.
  place(neck, head, [0, 0.78, 0.64], [0.85, 0.2, 0.04], MARK);
  const limb = (joint: V, l: Limb, arm: boolean, colour: string) => {
    const origin = apply(body, joint);
    const upper = times(body, turn(l.upper));
    const elbow = add(origin, apply(upper, [0, -1, 0]));
    const lower = times(upper, rotX(rad(l.lower)));
    place(origin, upper, [0, -0.5, 0], [0.84, 1.14, 0.84], colour);
    place(elbow, lower, [0, -0.5, 0], [0.8, 1.08, 0.8], colour);
    if (arm) hands.push(add(elbow, apply(lower, [0, -0.85, 0])));
  };
  limb([1.5, 1.9, 0], p.armL, true, FAR);
  limb([-1.5, 1.9, 0], p.armR, true, NEAR);
  limb([0.5, 0, 0], p.legL, false, FAR);
  limb([-0.5, 0, 0], p.legR, false, NEAR);
  if (p.tool) {
    // A bar through both hands, so the grip is right however the arms are set. The far hand is nearer the working end.
    const [near, far] = hands[0][0] < hands[1][0] ? hands : [hands[1], hands[0]];
    const along = unit(sub(far, near));
    const side = unit(cross(along, [0, 0, 1]));
    const m: M = [side[0], along[0], cross(side, along)[0], side[1], along[1], cross(side, along)[1], side[2], along[2], cross(side, along)[2]];
    boxes.push({ at: add(near, scale(along, 2)), size: [0.36, 6.6, 0.36], m, colour: TOOL });
  }
  return boxes;
}

const tint = (hex: string, light: number) => `rgb(${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * light)).join(',')})`;

/** The mannequin as an SVG picture of one pose. */
export function poseSvg(name: PoseName) {
  const pose = POSES[name];
  const boxes = figure(pose);
  const camera = times(rotX(rad(pose.pitch)), rotY(rad(pose.yaw)));
  const corners = (b: Box) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
    const local: V = [(i & 4 ? 0.5 : -0.5) * b.size[0], (i & 2 ? 0.5 : -0.5) * b.size[1], (i & 1 ? 0.5 : -0.5) * b.size[2]];
    return apply(camera, add(b.at, apply(b.m, local)));
  });
  const solid = boxes.flatMap(corners);
  const mid = (min: number, max: number) => (min + max) / 2;
  const centre: V = [0, 1, 2].map(a => mid(Math.min(...solid.map(c => c[a])), Math.max(...solid.map(c => c[a])))) as V;
  const tall = Math.max(...solid.map(c => c[1])) - Math.min(...solid.map(c => c[1]));
  const wide = Math.max(...solid.map(c => c[0])) - Math.min(...solid.map(c => c[0]));
  // Close and wide-angle, like a GFX camera, with the figure filling most of the frame's height.
  const distance = 18;
  const focal = Math.min(HEIGHT * 0.74 / tall, WIDTH * 0.58 / wide) * distance;
  const flat = (c: V) => {
    const depth = distance - (c[2] - centre[2]);
    return [WIDTH * pose.at + focal * (c[0] - centre[0]) / depth, HEIGHT / 2 - focal * (c[1] - centre[1]) / depth, depth];
  };
  // Far boxes first. Each box is convex, so its own visible faces never overlap.
  const seen = boxes.map(b => ({ b, c: corners(b) })).map(({ b, c }) => ({ b, c, depth: c.reduce((sum, p) => sum + flat(p)[2], 0) / 8 })).sort((x, y) => y.depth - x.depth);
  const polygons = seen.flatMap(({ b, c }) => FACES.flatMap(face => {
    const points = face.map(i => flat(c[i]));
    const area = points.reduce((sum, a, i) => { const z = points[(i + 1) % 4]; return sum + a[0] * z[1] - z[0] * a[1]; }, 0);
    if (area >= 0) return [];
    const raw = unit(cross(sub(c[face[1]], c[face[0]]), sub(c[face[3]], c[face[0]])));
    const normal = raw[2] < 0 ? scale(raw, -1) : raw;
    const light = 0.74 + 0.26 * Math.max(0, normal[0] * -0.35 + normal[1] * 0.75 + normal[2] * 0.56);
    return [`<polygon points="${points.map(a => `${a[0].toFixed(1)},${a[1].toFixed(1)}`).join(' ')}" fill="${tint(b.colour, light)}" stroke="#2f353d" stroke-width="3" stroke-linejoin="round"/>`];
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="${BACKDROP}"/>${polygons.join('')}</svg>`;
}

/** The mannequin as an image the image model can read. */
export async function poseGuide(name: PoseName) {
  const sharp = (await import('sharp')).default;
  const png = await sharp(Buffer.from(poseSvg(name))).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
