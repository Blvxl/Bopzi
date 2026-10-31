import type { Layer, ShapeLayer, Size, TextLayer } from '@/lib/types';
import { uid } from '@/lib/util';
import { makeShapeLayer, makeTextLayer } from './factory';
import { originForCenter } from './geometry';

/**
 * Ready-made game interface pieces: key prompts, counters, bars, badges. Each is a handful of ordinary shape
 * and text layers in one group, so every part can still be reworded, recoloured and resized.
 *
 * The look is the one hand-made Roblox thumbnail assets share, measured from a designer's own source file:
 * flat, fully saturated colour inside a thick black outline; bold comic lettering in white with a black
 * outline about 7% of its size and a soft shadow thrown down and to the left; a heavy geometric sans for the
 * game's own interface. No bevels, lips or shine: those are what make a piece look generated.
 * Sizes are written for a 1920-wide thumbnail and shrink with a smaller canvas.
 */

type TextProps = Partial<Omit<TextLayer, 'type' | 'id'>>;
type ShapeProps = Partial<Omit<ShapeLayer, 'type' | 'id'>>;
type Part =
  | { shape: string; x: number; y: number; w: number; h: number; props?: ShapeProps }
  | { text: string; cx: number; cy: number; size: number; props?: TextProps };

export type KitGroup = 'Prompts and buttons' | 'Roblox controls' | 'Numbers' | 'Labels' | 'Badges' | 'Timers and bars' | 'Pointers' | 'Frames and effects';
export type KitItem = {
  id: string;
  label: string;
  group: KitGroup;
  /** Adds an independent editable dimming layer above the artwork, below UI overlays. */
  artworkDim?: number;
  /** The piece as layers, laid out for a canvas of that size. Its card in the drawer is drawn from these too. */
  build: (canvas: Size) => Layer[];
};

const BLACK = '#000000';
/** Under a piece: soft, straight down. */
const drop = (size: number) => ({ enabled: true, color: BLACK, blur: size * 0.18, offsetX: 0, offsetY: size * 0.08, opacity: 0.5 });

/** Callout lettering: comic bold, white fading to a light grey, black outline, soft shadow down and to the left. */
const comic = (size: number, props: TextProps = {}): TextProps => ({
  font: 'comic',
  fill: '#FFFFFF',
  fill2: '#DCDCDC',
  stroke: BLACK,
  strokeWidth: size * 0.067,
  shadow: { enabled: true, color: BLACK, blur: size * 0.13, offsetX: -size * 0.047, offsetY: size * 0.078, opacity: 1 },
  uppercase: false,
  ...props,
});
/** The numbers on a bar: the same hand, with a heavier outline so they read over studs. */
const onBar = (size: number): TextProps => comic(size, { fill2: undefined, strokeWidth: size * 0.12, shadow: { enabled: true, color: BLACK, blur: size * 0.24, offsetX: 0, offsetY: size * 0.17, opacity: 0.65 } });
/** The game's own interface lettering: heavy, geometric, plain. */
const ui = (fill: string): TextProps => ({ font: 'montserrat', fill, strokeWidth: 0, uppercase: true });

const GREEN = { fill: '#4AFF4A', fill2: '#00FF00' };
const WARM = { fill: '#FFE600', fill2: '#FF8A00' };
const RED = { fill: '#FF0000', fill2: undefined };
const PINK = { fill: '#FF4DE1', fill2: '#FF00C8' };
const SPECTRUM = ['#FF0000', '#FFBA00', '#D8FF00', '#18FF00', '#00FCFF', '#0060FF', '#BA00FF', '#FF00E4'];

/** Lays the parts out around the middle of the canvas, as one group. `w` and `h` are the piece's own size. */
function build(name: string, w: number, h: number, parts: Part[], canvas: Size): Layer[] {
  const k = canvas.w / 1920;
  const groupId = parts.length > 1 ? uid('g') : undefined;
  const px = (x: number) => canvas.w / 2 + (x - w / 2) * k;
  const py = (y: number) => canvas.h / 2 + (y - h / 2) * k;
  const fit = <S extends { blur: number; offsetX: number; offsetY: number }>(shadow: S): S => ({ ...shadow, blur: shadow.blur * k, offsetX: shadow.offsetX * k, offsetY: shadow.offsetY * k });
  return parts.map((part) => {
    if ('shape' in part) {
      const { strokeWidth = 0, radius, shadow, ...rest } = part.props ?? {};
      const layer = makeShapeLayer(part.shape, { width: Math.round(part.w * k), height: Math.round(part.h * k), x: Math.round(px(part.x)), y: Math.round(py(part.y)), strokeWidth: Math.round(strokeWidth * k * 10) / 10, ...(radius !== undefined ? { radius: Math.round(radius * k) } : {}), ...(shadow ? { shadow: fit(shadow) } : {}), ...rest }, canvas);
      // A turned shape is placed by its middle, since turning swings it about its corner.
      if (layer.rotation) Object.assign(layer, originForCenter(layer, { x: px(part.x + part.w / 2), y: py(part.y + part.h / 2) }));
      return { ...layer, groupId };
    }
    const { shadow, ...rest } = part.props ?? {};
    // makeTextLayer shrinks the size and the outline for a smaller canvas; the shadow is scaled here.
    const made = makeTextLayer({ id: name, label: name, sample: part.text, props: { fontSize: part.size, ...rest, ...(shadow ? { shadow: fit(shadow) } : {}) } }, { text: part.text }, canvas);
    return { ...made, ...originForCenter(made, { x: px(part.cx), y: py(part.cy) }), groupId };
  });
}

const item = (id: string, label: string, group: KitGroup, w: number, h: number, parts: Part[]): KitItem => ({ id, label, group, build: (canvas) => build(label, w, h, parts, canvas) });

/** A flat piece: one colour, a black outline, a soft shadow under it. */
const flat = (fill: string, outline: number, shadowFor: number, more: ShapeProps = {}): ShapeProps => ({ fill, stroke: BLACK, strokeWidth: outline, shadow: drop(shadowFor), ...more });
/** A sticker: one colour with a white edge and a soft shadow. */
const sticker = (fill: string, outline: number, shadowFor: number, more: ShapeProps = {}): ShapeProps => ({ fill, stroke: '#FFFFFF', strokeWidth: outline, shadow: drop(shadowFor), ...more });
/** An effect that covers the whole canvas, whatever its size. */
const whole = (id: string, label: string, shape: string, props: ShapeProps): KitItem => ({
  id,
  label,
  group: 'Frames and effects',
  build: (canvas) => [makeShapeLayer(shape, { name: label, width: canvas.w, height: canvas.h, x: 0, y: 0, ...props }, canvas)],
});

export const KIT: KitItem[] = [
  // Roblox's own prompt: a see-through black plate, a white key with a black letter, the action in capitals.
  item('key-prompt', 'Key prompt', 'Prompts and buttons', 560, 200, [
    { shape: 'panel', x: 0, y: 0, w: 560, h: 200, props: { fill: BLACK, stroke: BLACK, strokeWidth: 8, radius: 34 } },
    { shape: 'keycap', x: 22, y: 18, w: 170, h: 164, props: { fill: '#FFFFFF', strokeWidth: 0, radius: 30 } },
    { text: 'E', cx: 107, cy: 102, size: 124, props: ui(BLACK) },
    { text: 'STEAL', cx: 376, cy: 102, size: 92, props: ui('#FFFFFF') },
  ]),
  // The hold-to-interact prompt: a black plate, the key inside a thin ring.
  item('hold-prompt', 'Hold prompt', 'Prompts and buttons', 520, 190, [
    { shape: 'panel', x: 0, y: 0, w: 520, h: 190, props: { fill: BLACK, stroke: BLACK, strokeWidth: 8, radius: 34 } },
    { shape: 'key-ring', x: 12, y: 9, w: 172, h: 172, props: { fill: '#FFFFFF', strokeWidth: 0 } },
    { text: 'E', cx: 98, cy: 98, size: 124, props: { font: 'comic', fill: '#FFFFFF', strokeWidth: 0, uppercase: false } },
    { text: 'Punch', cx: 344, cy: 98, size: 112, props: { font: 'comic', fill: '#FFFFFF', strokeWidth: 0, uppercase: false } },
  ]),
  item('keycap-prompt', 'Key', 'Prompts and buttons', 170, 164, [
    { shape: 'keycap', x: 0, y: 0, w: 170, h: 164, props: { fill: '#FFFFFF', stroke: BLACK, strokeWidth: 8, radius: 30, shadow: drop(160) } },
    { text: 'E', cx: 85, cy: 84, size: 118, props: ui(BLACK) },
  ]),
  item('play-button', 'Play button', 'Prompts and buttons', 440, 160, [
    { shape: 'button', x: 0, y: 0, w: 440, h: 160, props: flat('#1E90FF', 10, 160, { radius: 36 }) },
    { text: 'PLAY', cx: 220, cy: 80, size: 104, props: comic(104) },
  ]),
  item('buy-button', 'Buy button', 'Prompts and buttons', 400, 150, [
    { shape: 'button', x: 0, y: 0, w: 400, h: 150, props: flat('#00E000', 10, 150, { radius: 34 }) },
    { text: 'BUY', cx: 200, cy: 75, size: 98, props: comic(98) },
  ]),

  // What a player sees on screen: the phone controls, the top bar, voice chat. Drawn, not copied.
  item('ui-jump', 'Jump button', 'Roblox controls', 300, 300, [{ shape: 'ui-jump', x: 0, y: 0, w: 300, h: 300, props: { fill: '#1B3250', opacity: 0.9 } }]),
  item('ui-stick', 'Thumbstick', 'Roblox controls', 320, 320, [{ shape: 'ui-stick', x: 0, y: 0, w: 320, h: 320, props: { fill: '#1B3250', opacity: 0.9 } }]),
  item('ui-chat', 'Chat button', 'Roblox controls', 220, 220, [{ shape: 'ui-chat', x: 0, y: 0, w: 220, h: 220, props: { fill: '#1B3250' } }]),
  item('ui-menu', 'Menu button', 'Roblox controls', 220, 220, [{ shape: 'ui-menu', x: 0, y: 0, w: 220, h: 220, props: { fill: '#1B3250' } }]),
  item('ui-mic', 'Voice chat', 'Roblox controls', 200, 200, [{ shape: 'ui-mic', x: 0, y: 0, w: 200, h: 200, props: { fill: '#E3E5E8' } }]),
  item('ui-mic-off', 'Voice chat, muted', 'Roblox controls', 200, 200, [{ shape: 'ui-mic-off', x: 0, y: 0, w: 200, h: 200, props: { fill: '#E3E5E8' } }]),
  item('play', 'Play', 'Roblox controls', 250, 280, [{ shape: 'play', x: 0, y: 0, w: 250, h: 280, props: { fill: '#FFFFFF', shadow: drop(240) } }]),
  item('pause', 'Pause', 'Roblox controls', 200, 280, [{ shape: 'pause', x: 0, y: 0, w: 200, h: 280, props: { fill: '#FFFFFF', shadow: drop(240) } }]),

  item('money', 'Money counter', 'Numbers', 1100, 170, [{ text: '$997,151,167/s', cx: 550, cy: 85, size: 150, props: comic(150) }]),
  item('price', 'Price tag', 'Numbers', 520, 220, [
    { text: 'Garage', cx: 260, cy: 50, size: 84, props: comic(84) },
    { text: '$25,000', cx: 260, cy: 150, size: 116, props: comic(116, GREEN) },
  ]),
  item('gain', 'Coin gain', 'Numbers', 400, 170, [
    { shape: 'coin', x: 0, y: 14, w: 142, h: 142, props: flat('#FFD400', 8, 140) },
    { text: '+1', cx: 280, cy: 85, size: 150, props: comic(150) },
  ]),
  item('multiplier', 'Multiplier', 'Numbers', 320, 320, [
    { shape: 'burst', x: 0, y: 0, w: 320, h: 320, props: flat('#FF0000', 9, 300) },
    { text: 'x2', cx: 160, cy: 160, size: 170, props: comic(170, { rotation: -8 }) },
  ]),

  item('name-tag', 'Name and rarity', 'Labels', 900, 240, [
    { text: 'Skull Lucky Block', cx: 450, cy: 56, size: 96, props: comic(96) },
    { text: 'SECRET', cx: 450, cy: 168, size: 120, props: comic(120, { fill2: undefined, fillStops: SPECTRUM }) },
  ]),
  item('odds', 'Rarity odds', 'Labels', 820, 300, [
    { text: 'TITANIC PET', cx: 410, cy: 70, size: 120, props: comic(120, WARM) },
    { text: '1 IN ???', cx: 410, cy: 210, size: 156, props: comic(156, PINK) },
  ]),
  item('title-bar', 'Title bar', 'Labels', 1500, 220, [{ text: 'GROW OFFLINE', cx: 750, cy: 110, size: 200, props: comic(200) }]),
  item('speech', 'Speech bubble', 'Labels', 520, 400, [
    { shape: 'bubble', x: 0, y: 0, w: 520, h: 400, props: flat('#FFFFFF', 9, 300) },
    { text: 'OMG!', cx: 260, cy: 152, size: 140, props: { font: 'comic', fill: BLACK, strokeWidth: 0, uppercase: false } },
  ]),

  item('new', 'New burst', 'Badges', 360, 360, [
    { shape: 'spiky', x: 0, y: 0, w: 360, h: 360, props: flat('#FF0000', 9, 320) },
    { text: 'NEW!', cx: 180, cy: 180, size: 120, props: comic(120, { rotation: -10 }) },
  ]),
  item('update', 'Update ribbon', 'Badges', 800, 190, [
    { shape: 'ribbon', x: 0, y: 0, w: 800, h: 190, props: flat('#FF0000', 8, 190) },
    { text: 'UPDATE 2', cx: 400, cy: 95, size: 112, props: comic(112) },
  ]),
  item('codes', 'Codes pill', 'Badges', 440, 130, [
    { shape: 'button', x: 0, y: 0, w: 440, h: 130, props: flat('#A040FF', 9, 130, { radius: 65 }) },
    { text: 'CODES', cx: 220, cy: 65, size: 90, props: comic(90) },
  ]),
  item('versus', 'Versus', 'Badges', 440, 440, [
    { shape: 'spiky', x: 0, y: 0, w: 440, h: 440, props: flat('#FF0000', 10, 400) },
    { text: 'VS', cx: 220, cy: 220, size: 230, props: comic(230, WARM) },
  ]),

  // A countdown over the icon is how games announce an update: an hourglass and how long is left.
  {
    id: 'timer', label: 'Update timer', group: 'Timers and bars', artworkDim: 0.55,
    build: (canvas) => {
      // Size against the shorter edge, so a square icon gets a substantial timer too.
      const scale = Math.min(canvas.w, canvas.h) / 1080;
      const pieces = build('Update timer', 520, 700, [
        { shape: 'hourglass', x: 70, y: 0, w: 380, h: 528, props: { name: 'Timer hourglass', fill: '#FFFFFF', strokeWidth: 0, shadow: { enabled: true, color: BLACK, blur: 12, offsetX: 0, offsetY: 5, opacity: 0.3 } } },
        { text: '24H', cx: 260, cy: 620, size: 172, props: { name: 'Timer message', font: 'montserrat', fill: '#FFFFFF', stroke: BLACK, strokeWidth: 0, uppercase: true, shadow: { enabled: true, color: BLACK, blur: 8, offsetX: 0, offsetY: 4, opacity: 0.35 } } },
      ], { w: 1920, h: 1920 });
      return pieces.map(layer => ({
        ...layer, x: (layer.x - 960) * scale + canvas.w / 2, y: (layer.y - 960) * scale + canvas.h / 2,
        ...(layer.type === 'shape' ? { width: layer.width * scale, height: layer.height * scale } : {}),
        ...(layer.type === 'text' ? { fontSize: layer.fontSize * scale, strokeWidth: layer.strokeWidth * scale } : {}),
        shadow: { ...layer.shadow, blur: layer.shadow.blur * scale, offsetX: layer.shadow.offsetX * scale, offsetY: layer.shadow.offsetY * scale },
      }));
    },
  },
  item('countdown', 'Countdown clock', 'Timers and bars', 760, 200, [
    { shape: 'clock', x: 0, y: 14, w: 172, h: 172, props: flat('#FFFFFF', 8, 170) },
    { text: '2 DAYS', cx: 480, cy: 100, size: 150, props: comic(150) },
  ]),
  // Studs, a red stretch for what is left, a thick black outline: the bar as game thumbnails draw it.
  item('health', 'Studded bar', 'Timers and bars', 1100, 130, [
    { shape: 'bar', x: 0, y: 0, w: 1100, h: 130, props: { fill: '#2BFF14', fill2: '#FF1E1E', value: 68, studs: true, stroke: BLACK, strokeWidth: 10, radius: 34, shadow: drop(130) } },
    { text: '679,235/999,999', cx: 550, cy: 65, size: 66, props: onBar(66) },
  ]),
  item('boss-bar', 'Boss bar', 'Timers and bars', 1000, 210, [
    { text: 'Boss', cx: 500, cy: 40, size: 76, props: onBar(76) },
    { shape: 'bar', x: 0, y: 94, w: 1000, h: 116, props: { fill: '#3CFF00', fill2: '#FF0A46', value: 73, studs: false, stroke: BLACK, strokeWidth: 6, radius: 16, shadow: drop(110) } },
    { text: '953,719 / 1,372,832', cx: 500, cy: 152, size: 60, props: onBar(60) },
  ]),
  item('progress', 'Level bar', 'Timers and bars', 760, 200, [
    { text: 'LEVEL 12', cx: 380, cy: 48, size: 88, props: comic(88) },
    { shape: 'bar', x: 0, y: 104, w: 760, h: 92, props: { fill: '#FFD400', fill2: '#383838', value: 58, studs: false, stroke: BLACK, strokeWidth: 9, radius: 46, shadow: drop(90) } },
  ]),

  // Arrows are one flat red: bare when they sweep, with a white edge and a soft shadow when they stand upright.
  item('arrow-swoosh', 'Swoosh arrow', 'Pointers', 520, 385, [{ shape: 'arrow-swoosh', x: 0, y: 0, w: 520, h: 385, props: { fill: '#FF0000', shadow: drop(300) } }]),
  item('arrow-curve', 'Curved arrow', 'Pointers', 620, 326, [{ shape: 'arrow-curve', x: 0, y: 0, w: 620, h: 326, props: { fill: '#FF0000', shadow: drop(300) } }]),
  item('arrow-hook', 'Rising arrow', 'Pointers', 400, 420, [{ shape: 'arrow-hook', x: 0, y: 0, w: 400, h: 420, props: sticker('#FF0000', 12, 360) }]),
  item('arrow-up', 'Fat arrow', 'Pointers', 360, 400, [{ shape: 'arrow-up', x: 0, y: 0, w: 360, h: 400, props: sticker('#FF0000', 13, 360) }]),
  item('arrow-thin', 'Thin arrow', 'Pointers', 200, 440, [{ shape: 'arrow-thin', x: 0, y: 0, w: 200, h: 440, props: sticker('#FF0000', 10, 300) }]),
  item('cursor', 'Cursor', 'Pointers', 220, 306, [{ shape: 'cursor', x: 0, y: 0, w: 220, h: 306, props: flat('#FFFFFF', 9, 260) }]),
  item('highlight', 'Highlight ring', 'Pointers', 380, 380, [{ shape: 'ellipse', x: 0, y: 0, w: 380, h: 380, props: { fill: '', stroke: '#FF0000', strokeWidth: 22, shadow: drop(200) } }]),
  // Three cartoon marks fanned out, each with a black edge and a sliver of light.
  item('alert', 'Alert marks', 'Pointers', 540, 470, [
    { shape: 'exclaim', x: 30, y: 150, w: 126, h: 300, props: flat('#FF0000', 9, 260, { rotation: -24 }) },
    { shape: 'glint', x: 50, y: 172, w: 26, h: 78, props: { fill: '#FFFFFF', opacity: 0.6, rotation: -24 } },
    { shape: 'exclaim', x: 190, y: 20, w: 160, h: 380, props: flat('#FF0000', 10, 300) },
    { shape: 'glint', x: 222, y: 46, w: 32, h: 104, props: { fill: '#FFFFFF', opacity: 0.6 } },
    { shape: 'exclaim', x: 392, y: 120, w: 132, h: 316, props: flat('#FF0000', 9, 260, { rotation: 16 }) },
    { shape: 'glint', x: 446, y: 132, w: 26, h: 82, props: { fill: '#FFFFFF', opacity: 0.6, rotation: 16 } },
  ]),
  item('alert-block', 'Block marks', 'Pointers', 330, 420, [
    { shape: 'exclaim-block', x: 0, y: 0, w: 150, h: 420, props: sticker('#FF0000', 10, 300) },
    { shape: 'exclaim-block', x: 180, y: 0, w: 150, h: 420, props: sticker('#FF0000', 10, 300) },
  ]),

  item('card-frame', 'Card frame', 'Frames and effects', 560, 760, [{ shape: 'rect', x: 0, y: 0, w: 560, h: 760, props: { fill: '', stroke: '#FFD400', strokeWidth: 26, radius: 44, shadow: drop(300) } }]),
  {
    id: 'border',
    label: 'Icon border',
    group: 'Frames and effects',
    // Fitted to the canvas, as the coloured frames on game icons are.
    build: (canvas) => {
      const line = Math.round(canvas.w * 0.022);
      return [makeShapeLayer('rect', { name: 'Border', width: canvas.w - line, height: canvas.h - line, x: line / 2, y: line / 2, fill: '', stroke: '#2BFF14', strokeWidth: line, radius: 0 }, canvas)];
    },
  },
  {
    id: 'split',
    label: 'Split bar',
    group: 'Frames and effects',
    // The slanted divider of a "this or that" thumbnail: taller than the canvas, so it runs off both edges.
    build: (canvas) => {
      const width = Math.round(canvas.w * 0.016), height = Math.round(canvas.h * 1.3);
      const bar = makeShapeLayer('rect', { name: 'Split bar', width, height, fill: '#FFFFFF', stroke: BLACK, strokeWidth: Math.round(canvas.w * 0.004), rotation: 8 }, canvas);
      return [{ ...bar, ...originForCenter(bar, { x: canvas.w / 2, y: canvas.h / 2 }) }];
    },
  },
  item('sunburst', 'Sun rays', 'Frames and effects', 1500, 1500, [{ shape: 'sunrays', x: 0, y: 0, w: 1500, h: 1500, props: { fill: '#FFFFFF', value: 12, opacity: 0.85 } }]),
  whole('speed', 'Speed lines', 'speedlines', { fill: '#FFFFFF', value: 70 }),
  whole('vignette', 'Vignette', 'vignette', { fill: '#000000' }),
  item('spotlight', 'Spotlight', 'Frames and effects', 720, 900, [{ shape: 'spotlight', x: 0, y: 0, w: 720, h: 900, props: { fill: '#FFF6C8' } }]),
  item('ground-shadow', 'Ground shadow', 'Frames and effects', 720, 160, [{ shape: 'blob', x: 0, y: 0, w: 720, h: 160, props: { fill: '#000000' } }]),
  item('impact', 'Impact', 'Frames and effects', 620, 620, [{ shape: 'impact', x: 0, y: 0, w: 620, h: 620, props: { fill: '#FFFFFF', stroke: '#FF0000', strokeWidth: 7 } }]),
  item('swoosh', 'Swoosh', 'Frames and effects', 640, 290, [{ shape: 'swoosh', x: 0, y: 0, w: 640, h: 290, props: { fill: '#FFFFFF' } }]),
  // Sparkles come in clusters of different sizes, never one alone.
  item('sparkles', 'Sparkles', 'Frames and effects', 430, 430, [
    { shape: 'sparkle', x: 150, y: 120, w: 270, h: 270 },
    { shape: 'sparkle', x: 10, y: 20, w: 150, h: 150 },
    { shape: 'sparkle', x: 40, y: 290, w: 110, h: 110 },
  ]),
  item('gold-sparkles', 'Gold sparkles', 'Frames and effects', 440, 440, [
    { shape: 'sparkle', x: 110, y: 90, w: 230, h: 260, props: { fill: '#FFD700' } },
    { shape: 'sparkle', x: 0, y: 0, w: 130, h: 150, props: { fill: '#FFD700' } },
    { shape: 'sparkle', x: 330, y: 60, w: 80, h: 90, props: { fill: '#FFD700' } },
    { shape: 'sparkle', x: 320, y: 300, w: 120, h: 140, props: { fill: '#FFD700' } },
    { shape: 'sparkle', x: 50, y: 330, w: 70, h: 80, props: { fill: '#FFD700' } },
  ]),
  item('glow-sparkle', 'Glowing sparkle', 'Frames and effects', 420, 440, [
    { shape: 'sparkle-thin', x: 130, y: 0, w: 290, h: 420, props: { fill: '#FFFFFF', glow: { enabled: true, color: '#FFFFFF', blur: 34, strength: 2 } } },
    { shape: 'sparkle-thin', x: 0, y: 30, w: 100, h: 140, props: { fill: '#FFFFFF', glow: { enabled: true, color: '#FFFFFF', blur: 22, strength: 2 } } },
    { shape: 'sparkle-thin', x: 20, y: 290, w: 90, h: 130, props: { fill: '#FFFFFF', glow: { enabled: true, color: '#FFFFFF', blur: 22, strength: 2 } } },
  ]),
];

// ---- pieces the user saved from their own canvas

export type SavedPiece = { id: string; name: string; layers: Layer[] };
const SAVED_KEY = 'bopzi:kit';

export function savedPieces(): SavedPiece[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(saved) ? (saved as SavedPiece[]).filter((p) => p && typeof p.name === 'string' && Array.isArray(p.layers)) : [];
  } catch {
    return [];
  }
}

export function storePieces(pieces: SavedPiece[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(pieces));
}

/** Fresh copies of a set of layers, centred on the canvas and tied into one group. */
export function placeCopies(layers: Layer[], canvas: Size, box: (l: Layer) => { x: number; y: number; w: number; h: number }): Layer[] {
  const boxes = layers.map(box);
  const left = Math.min(...boxes.map((b) => b.x)), top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w)), bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const dx = Math.round(canvas.w / 2 - (left + right) / 2), dy = Math.round(canvas.h / 2 - (top + bottom) / 2);
  const groupId = layers.length > 1 ? uid('g') : undefined;
  return layers.map((l) => ({ ...l, id: uid('l'), x: l.x + dx, y: l.y + dy, locked: false, visible: true, groupId }));
}
