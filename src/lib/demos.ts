import type { Blend, Glow, PromptState, Shadow } from './types';

/**
 * Demo projects. Each one is described in canvas fractions (0–1 of 1920 × 1080) so the same spec
 * drives two things: the editable layers the studio creates, and the preview drawn on the site.
 * The artwork lives in /public/demos/<id>/. It was generated for Bopzi as demonstration material (see the README there).
 */

export type DemoText = {
  text: string;
  font: string;
  /** Canvas pixels. */
  fontSize: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  letterSpacing: number;
  lineHeight: number;
  uppercase: boolean;
  /** Centre of the text block. */
  cx: number;
  cy: number;
  rotation: number;
  shadow?: Shadow;
  glow?: Glow;
};

export type DemoLight = {
  label: string;
  color: string;
  blend: Blend;
  cx: number;
  cy: number;
  /** Canvas pixels. */
  w: number;
  h: number;
  opacity: number;
  /** Drawn over the character instead of behind it. */
  front?: boolean;
};

export type DemoSpec = {
  id: string;
  name: string;
  genre: string;
  /** One line for cards. */
  blurb: string;
  /** Canvas colour behind the background image. */
  canvas: string;
  character: { cx: number; cy: number; /** Height as a fraction of the canvas. */ h: number; rotation: number; shadow?: Shadow; glow?: Glow };
  lights: DemoLight[];
  texts: DemoText[];
  prompt: Partial<PromptState>;
};

/** Public URLs of a demo's artwork, present only when the files exist. */
export type DemoFiles = { background: string; character: string };
export type Demo = DemoSpec & { files: DemoFiles | null };

const hard = (y: number): Shadow => ({ enabled: true, color: '#000000', blur: 0, offsetX: 0, offsetY: y, opacity: 1 });
const soft = (blur: number, y: number, opacity: number): Shadow => ({ enabled: true, color: '#000000', blur, offsetX: 0, offsetY: y, opacity });
/** A tight white glow reads as the cut-out sticker edge thumbnails use. */
const outline = (): Glow => ({ enabled: true, color: '#FFFFFF', blur: 9, strength: 3 });

export const DEMOS: DemoSpec[] = [
  {
    id: 'simulator',
    name: 'Coin Simulator',
    genre: 'Simulator',
    blurb: 'Big character, bright world, a title you can read at thumbnail size.',
    canvas: '#16345c',
    character: { cx: 0.735, cy: 0.52, h: 0.95, rotation: 4, shadow: soft(40, 20, 0.5), glow: outline() },
    lights: [
      { label: 'Warm rim', color: '#FFD95A', blend: 'screen', cx: 0.74, cy: 0.46, w: 1250, h: 1250, opacity: 0.25 },
      { label: 'Shade', color: '#06243f', blend: 'multiply', cx: 0.24, cy: 0.5, w: 1500, h: 1400, opacity: 0.55 },
    ],
    texts: [
      {
        text: 'COIN\nSIMULATOR',
        font: 'luckiest',
        fontSize: 170,
        fill: '#FFFFFF',
        stroke: '#111111',
        strokeWidth: 13,
        letterSpacing: 0,
        lineHeight: 0.95,
        uppercase: true,
        cx: 0.275,
        cy: 0.37,
        rotation: -4,
        shadow: hard(15),
      },
      {
        text: 'UPDATE 2',
        font: 'titan',
        fontSize: 92,
        fill: '#FFD95A',
        stroke: '#111111',
        strokeWidth: 8,
        letterSpacing: 2,
        lineHeight: 1,
        uppercase: true,
        cx: 0.275,
        cy: 0.73,
        rotation: -4,
        shadow: hard(8),
      },
    ],
    prompt: { genre: 'simulator', style: 'cartoon', palette: 'contrast', lighting: 'day', placement: 'right', textSpace: 'side' },
  },
  {
    id: 'obby',
    name: 'Sky Obby',
    genre: 'Obby',
    blurb: 'A character mid-jump with the course falling away behind it.',
    canvas: '#1b2550',
    character: { cx: 0.715, cy: 0.5, h: 0.86, rotation: -6, shadow: soft(36, 22, 0.45), glow: outline() },
    lights: [
      { label: 'Cool glow', color: '#5BC2FF', blend: 'screen', cx: 0.68, cy: 0.46, w: 1200, h: 1200, opacity: 0.25 },
      { label: 'Shade', color: '#0b1030', blend: 'multiply', cx: 0.22, cy: 0.5, w: 1500, h: 1300, opacity: 0.6 },
    ],
    texts: [
      {
        text: 'SKY\nOBBY',
        font: 'bangers',
        fontSize: 270,
        fill: '#FFFFFF',
        stroke: '#101425',
        strokeWidth: 11,
        letterSpacing: 6,
        lineHeight: 0.92,
        uppercase: true,
        cx: 0.28,
        cy: 0.46,
        rotation: -3,
        glow: { enabled: true, color: '#5BC2FF', blur: 50, strength: 2 },
      },
    ],
    prompt: { genre: 'obby', style: 'render', composition: 'high', palette: 'cool', lighting: 'day', placement: 'right', textSpace: 'side' },
  },
  {
    id: 'horror',
    name: "Don't Look",
    genre: 'Horror',
    blurb: 'A dark scene, one cold light and a title that sets the mood.',
    canvas: '#0b0d10',
    character: { cx: 0.7, cy: 0.57, h: 0.92, rotation: 0, shadow: soft(60, 0, 0.8), glow: { enabled: true, color: '#6FE3D0', blur: 26, strength: 1 } },
    lights: [
      { label: 'Cold rim', color: '#6FE3D0', blend: 'screen', cx: 0.7, cy: 0.4, w: 900, h: 1100, opacity: 0.4 },
      { label: 'Shade', color: '#000000', blend: 'source-over', cx: 0.7, cy: 1.06, w: 1700, h: 800, opacity: 0.85, front: true },
      { label: 'Title shade', color: '#000000', blend: 'source-over', cx: 0.26, cy: 0.45, w: 1300, h: 1000, opacity: 0.6 },
    ],
    texts: [
      {
        text: "DON'T\nLOOK",
        font: 'creepster',
        fontSize: 250,
        fill: '#E8E2D6',
        stroke: '#000000',
        strokeWidth: 6,
        letterSpacing: 8,
        lineHeight: 0.95,
        uppercase: true,
        cx: 0.28,
        cy: 0.44,
        rotation: 0,
        glow: { enabled: true, color: '#D01818', blur: 46, strength: 2 },
      },
    ],
    prompt: { genre: 'horror', style: 'dark', composition: 'tunnel', palette: 'mono', lighting: 'fog', placement: 'right', textSpace: 'side' },
  },
];
