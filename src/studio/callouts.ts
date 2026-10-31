import type { Shadow } from '@/lib/types';
import type { TextPreset } from './factory';

/**
 * Callouts are the label, the "+1" marks and the arrows a thumbnail carries on top of its artwork.
 * Here they are ordinary layers, so they can be moved, reworded, restyled and removed.
 * They are never drawn into the generated image.
 */

const hard = (y: number): Shadow => ({ enabled: true, color: '#000000', blur: 0, offsetX: 0, offsetY: y, opacity: 1 });

export const LABEL: TextPreset = {
  id: 'callout-label',
  label: 'Label',
  sample: 'Vault',
  props: { name: 'Label', font: 'lilita', fontSize: 250, fill: '#FFF04A', fill2: '#FF9D1C', stroke: '#111111', strokeWidth: 15, uppercase: false, rotation: -6, shadow: hard(14) },
};

export const PLUS: TextPreset = {
  id: 'callout-plus',
  label: 'Plus one',
  sample: '+1',
  props: { name: 'Plus one', font: 'lilita', fontSize: 150, fill: '#FFFFFF', stroke: '#111111', strokeWidth: 11, uppercase: false, shadow: hard(9) },
};

/** The rainbow fill, left to right. */
export const RAINBOW = ['#FF4B4B', '#FF9F2E', '#FFE838', '#4BDB6A', '#42B4FF', '#B56BFF'];

export const ARROWS = [
  { id: 'red', label: 'Red arrow', color: '#F5311F' },
  { id: 'yellow', label: 'Yellow arrow', color: '#FFD21F' },
  { id: 'white', label: 'White arrow', color: '#FFFFFF' },
  { id: 'blue', label: 'Blue arrow', color: '#2F9BFF' },
] as const;

export type ArrowShape = 'curved' | 'straight';

/**
 * An arrow with the white-then-black outline thumbnails use. The curved one bends down and to the left,
 * the straight one points down; flip or rotate either on the canvas.
 */
export function arrowSvg(color: string, shape: ArrowShape = 'curved') {
  const shaft = shape === 'curved' ? 'M 232 44 C 122 40, 66 112, 92 196' : 'M 150 46 L 150 190';
  const head = shape === 'curved' ? '38,186 152,180 100,282' : '86,178 214,178 150,284';
  const pass = (stroke: string, shaftWidth: number, headWidth: number) =>
    `<path d="${shaft}" fill="none" stroke="${stroke}" stroke-width="${shaftWidth}" stroke-linecap="round"/><polygon points="${head}" fill="${stroke}" stroke="${stroke}" stroke-width="${headWidth}" stroke-linejoin="round"/>`;
  // One flat colour with a white edge, as hand-made thumbnail arrows are. A white arrow keeps a dark edge to be seen at all.
  const edge = color.toUpperCase() === '#FFFFFF' ? pass('#111111', 62, 22) : pass('#FFFFFF', 62, 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 320" width="600" height="640">${edge}${pass(color, 44, 4)}</svg>`;
}

export const arrowPreview = (color: string, shape: ArrowShape = 'curved') => `data:image/svg+xml;utf8,${encodeURIComponent(arrowSvg(color, shape))}`;

/** The arrow as a PNG file, so it goes on the canvas like any uploaded image. */
export async function arrowFile(color: string, name: string, shape: ArrowShape = 'curved') {
  const img = new Image();
  img.src = arrowPreview(color, shape);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 640;
  canvas.getContext('2d')!.drawImage(img, 0, 0, 600, 640);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the arrow.'))), 'image/png'));
  return new File([blob], `${name}.png`, { type: 'image/png' });
}

/** What the inspiration's own callouts suggest for this scene. Positions are fractions of the frame. */
export type Suggested = { label: string; labelAt: [number, number] | null; small: string; smallAt: [number, number][] };

const point = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) ? [v[0], v[1]] : null;
/** Short and plain: this text ends up on the canvas. */
const words = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} +\-$%!?.,'x×]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Reads the notes that come back with a generated image. Anything unusable is dropped; nothing is trusted blindly. */
export function parseSuggested(notes: unknown): Suggested | null {
  if (typeof notes !== 'string' || !notes.trim()) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(notes.slice(notes.indexOf('{'), notes.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  const label = words(raw.label, 28);
  const small = words(raw.small, 8);
  const smallAt = small && Array.isArray(raw.smallAt) ? raw.smallAt.map(point).filter((p): p is [number, number] => !!p).slice(0, 6) : [];
  if (!label && !smallAt.length) return null;
  return { label, labelAt: label ? point(raw.labelAt) ?? [0.72, 0.2] : null, small, smallAt };
}
