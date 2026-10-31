import {
  THUMBNAIL,
  type Size,
  type AssetRecord,
  type Blend,
  type Glow,
  type ImageLayer,
  type ImageRole,
  type LightLayer,
  type Shadow,
  type ShapeLayer,
  type TextLayer,
} from '@/lib/types';
import { uid } from '@/lib/util';
import { shapeOf } from './shapes';
import { canvasScale, layerSize, originForCenter } from './geometry';

const noShadow = (): Shadow => ({ enabled: false, color: '#000000', blur: 24, offsetX: 0, offsetY: 16, opacity: 0.6 });
const noGlow = (): Glow => ({ enabled: false, color: '#FFD95A', blur: 40, strength: 1 });

const base = (name: string) => ({
  id: uid('l'),
  name,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false,
  shadow: noShadow(),
  glow: noGlow(),
});

const stripExt = (name: string) => name.replace(/\.(png|jpe?g|webp)$/i, '');

export function imagePlacement(width: number, height: number, role: ImageRole, canvas: Size = THUMBNAIL) {
  const scale =
    role === 'background'
      ? canvasScale(width, height, 'cover', canvas)
      : Math.min(canvasScale(width, height, 'contain', canvas) * (role === 'character' ? 0.86 : 0.5), role === 'character' ? 4 : 1);
  return {
    scaleX: scale,
    scaleY: scale,
    x: Math.round((canvas.w - width * scale) / 2),
    y: Math.round((canvas.h - height * scale) / 2),
  };
}

/** `canvas` is the size of the canvas the layer is made for; a thumbnail when left out. */
export function makeImageLayer(rec: AssetRecord, role: ImageRole, canvas: Size = THUMBNAIL): ImageLayer {
  return {
    ...base(role === 'background' ? 'Background' : stripExt(rec.name) || 'Image'),
    type: 'image',
    assetId: rec.id,
    width: rec.width,
    height: rec.height,
    role,
    // Character and game-asset renders are the originals Bopzi protects.
    original: role === 'character',
    flipX: false,
    ...imagePlacement(rec.width, rec.height, role, canvas),
  };
}

export type TextPreset = {
  id: string;
  label: string;
  sample: string;
  props: Partial<Omit<TextLayer, 'type' | 'id'>>;
};

const hardShadow = (y: number): Shadow => ({ enabled: true, color: '#000000', blur: 0, offsetX: 0, offsetY: y, opacity: 1 });

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'pop',
    label: 'Bold',
    sample: 'TITLE',
    props: { font: 'luckiest', fontSize: 210, fill: '#FFFFFF', stroke: '#111111', strokeWidth: 12, shadow: hardShadow(14) },
  },
  {
    id: 'gold',
    label: 'Gold',
    sample: 'TITLE',
    props: { font: 'titan', fontSize: 190, fill: '#FFD95A', stroke: '#111111', strokeWidth: 12, shadow: hardShadow(12) },
  },
  {
    id: 'strike',
    label: 'Impact',
    sample: 'TITLE',
    props: {
      font: 'bangers',
      fontSize: 230,
      fill: '#FFFFFF',
      stroke: '#111111',
      strokeWidth: 10,
      letterSpacing: 4,
      glow: { enabled: true, color: '#5BC2FF', blur: 50, strength: 2 },
    },
  },
  {
    id: 'dread',
    label: 'Dread',
    sample: 'TITLE',
    props: {
      font: 'creepster',
      fontSize: 220,
      fill: '#E8E2D6',
      stroke: '#000000',
      strokeWidth: 6,
      letterSpacing: 6,
      glow: { enabled: true, color: '#D01818', blur: 46, strength: 2 },
    },
  },
  {
    id: 'clean',
    label: 'Clean title',
    sample: 'Title',
    props: {
      font: 'sora',
      fontSize: 170,
      fill: '#FFFFFF',
      strokeWidth: 0,
      uppercase: false,
      letterSpacing: -4,
      shadow: { enabled: true, color: '#000000', blur: 30, offsetX: 0, offsetY: 10, opacity: 0.55 },
    },
  },
];

export function makeTextLayer(preset?: TextPreset, place?: { text?: string; center?: { x: number; y: number } }, canvas: Size = THUMBNAIL): TextLayer {
  const layer: TextLayer = {
    ...base('Text'),
    type: 'text',
    text: place?.text ?? preset?.sample ?? 'YOUR TITLE',
    font: 'luckiest',
    fontSize: 200,
    fill: '#FFFFFF',
    stroke: '#111111',
    strokeWidth: 10,
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1,
    uppercase: true,
    ...preset?.props,
  };
  // Presets are sized for a thumbnail; on a smaller canvas the lettering shrinks with it.
  const k = canvas.w / THUMBNAIL.w;
  if (k !== 1) Object.assign(layer, { fontSize: Math.round(layer.fontSize * k), strokeWidth: Math.round(layer.strokeWidth * k * 10) / 10 });
  const { w, h } = layerSize(layer);
  // Kept fully on the canvas, wherever it was asked to go.
  const cx = Math.min(canvas.w - w / 2 - 20, Math.max(w / 2 + 20, place?.center?.x ?? canvas.w / 2));
  const cy = Math.min(canvas.h - h / 2 - 20, Math.max(h / 2 + 20, place?.center?.y ?? canvas.h / 2));
  Object.assign(layer, originForCenter(layer, { x: cx, y: cy }));
  return layer;
}

/** A shape in the middle of the canvas, about a fifth of its width, in the shape's own proportions. */
export function makeShapeLayer(shape: string, props: Partial<Omit<ShapeLayer, 'type' | 'id'>> = {}, canvas: Size = THUMBNAIL): ShapeLayer {
  const def = shapeOf(shape);
  const width = props.width ?? Math.round(canvas.w * 0.2);
  const height = props.height ?? Math.round(width / (def.ratio ?? 1));
  return {
    ...base(def.label),
    type: 'shape',
    shape: def.id,
    width,
    height,
    fill: '#FFFFFF',
    stroke: '#111111',
    strokeWidth: 0,
    x: Math.round((canvas.w - width) / 2),
    y: Math.round((canvas.h - height) / 2),
    // A drawn game piece starts with the outline, corners and colours it is known by.
    ...(def.kind === 'widget' ? { stroke: '#0B0D12', strokeWidth: Math.round(height * 0.08), ...WIDGET_LOOKS[def.id]?.(height) } : {}),
    ...props,
  };
}

const WIDGET_LOOKS: Record<string, (h: number) => Partial<ShapeLayer>> = {
  bar: (h) => ({ stroke: '#000000', fill: '#2BFF14', fill2: '#FF1E1E', value: 68, radius: Math.round(h / 2), studs: true }),
  button: (h) => ({ stroke: '#000000', fill: '#1E90FF', radius: Math.round(h * 0.24) }),
  panel: (h) => ({ fill: '#8C8C8C', stroke: '#FFFFFF', radius: Math.round(h * 0.12), strokeWidth: Math.round(h * 0.03) }),
  keycap: (h) => ({ fill: '#FFFFFF', radius: Math.round(h * 0.2), strokeWidth: 0 }),
  'key-ring': () => ({ fill: '#FFFFFF', strokeWidth: 0 }),
  sunrays: () => ({ fill: '#FFFFFF', strokeWidth: 0, value: 12 }),
  speedlines: () => ({ fill: '#FFFFFF', strokeWidth: 0, value: 70 }),
  vignette: () => ({ fill: '#000000', strokeWidth: 0 }),
  blob: () => ({ fill: '#000000', strokeWidth: 0 }),
  spotlight: () => ({ fill: '#FFF6C8', strokeWidth: 0 }),
  'ui-jump': () => ({ fill: '#1B3250', strokeWidth: 0 }),
  'ui-stick': () => ({ fill: '#1B3250', strokeWidth: 0 }),
  'ui-chat': () => ({ fill: '#1B3250', strokeWidth: 0 }),
  'ui-menu': () => ({ fill: '#1B3250', strokeWidth: 0 }),
  'ui-mic': () => ({ fill: '#E3E5E8', strokeWidth: 0 }),
  'ui-mic-off': () => ({ fill: '#E3E5E8', strokeWidth: 0 }),};

export type LightPreset ={ id: string; label: string; hint: string; color: string; blend: Blend; size: number; opacity: number };

export const LIGHT_PRESETS: LightPreset[] = [
  { id: 'warm', label: 'Warm rim', hint: 'Sunset or fire light behind a character', color: '#FFB347', blend: 'screen', size: 1000, opacity: 0.9 },
  { id: 'cool', label: 'Cool glow', hint: 'Magic, ice or screen light', color: '#5BC2FF', blend: 'screen', size: 1000, opacity: 0.9 },
  { id: 'spot', label: 'Spotlight', hint: 'A bright white hotspot', color: '#FFFFFF', blend: 'overlay', size: 900, opacity: 1 },
  { id: 'shade', label: 'Shade', hint: 'Darken a corner so the subject stands out', color: '#000000', blend: 'source-over', size: 1300, opacity: 0.75 },
];

export function makeLightLayer(p: LightPreset, canvas: Size = THUMBNAIL): LightLayer {
  return {
    ...base(p.label),
    type: 'light',
    width: p.size,
    height: p.size,
    color: p.color,
    blend: p.blend,
    opacity: p.opacity,
    x: Math.round((canvas.w - p.size) / 2),
    y: Math.round((canvas.h - p.size) / 2),
  };
}
