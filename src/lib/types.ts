export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/** A game icon is edited on a square canvas of this size and exported at ICON_EXPORT. */
export const ICON_SIZE = 1024;
export const ICON_EXPORT = 512;

export type Shadow = {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
};

export type Glow = {
  enabled: boolean;
  color: string;
  blur: number;
  /** Number of stacked passes, 1–3. */
  strength: number;
};

export type Outline = { enabled: boolean; color: string; width: number };

type Base = {
  id: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  shadow: Shadow;
  glow: Glow;
  /** Layers that share this are one object: picked, moved, resized, copied and deleted together. */
  groupId?: string;
};

export type ImageRole = 'character' | 'background' | 'image';

export type ImageLayer = Base & {
  type: 'image';
  assetId: string;
  /** Natural pixel size of the source file. */
  width: number;
  height: number;
  role: ImageRole;
  /** Marked as an original asset. Protected while the project's Lock Original Assets is on. */
  original: boolean;
  flipX: boolean;
  /** A solid edge around the picture's own shape, the cut-out sticker look. `width` is in canvas pixels. */
  outline?: Outline;
  /** How much of each side is trimmed away, as fractions of the picture. The stored file is untouched. */
  crop?: { left: number; top: number; right: number; bottom: number };
  /** Rounded corners, 0 to 50: the percentage of the shorter side. 50 makes a square picture a circle. */
  corner?: number;
  /** Blur in canvas pixels; brightness and saturation as percentages, 100 being unchanged. */
  adjust?: { blur: number; brightness: number; saturation: number };
  /** Set on an arrow from the Callouts kit: its shape and colour, so the colour can be changed later. */
  arrow?: { shape: 'straight' | 'curved'; color: string };
  /** Set on a generated image that is a changed version of another: the id of the first one in that line. */
  conceptId?: string;
  /** A user-facing name shared by all versions of a generated concept. */
  conceptName?: string;
  /** The request and source version for a saved AI edit. */
  edit?: { instruction: string; parentId: string; area: boolean };
  source?: 'screenshot';
};

export type TextAlign = 'left' | 'center' | 'right';

export type TextLayer = Base & {
  type: 'text';
  text: string;
  font: string;
  fontSize: number;
  fill: string;
  /** A second colour: the fill then runs from `fill` at the top to this at the bottom. */
  fill2?: string;
  /** Several colours across the text from left to right (a rainbow). Takes over from `fill` and `fill2`. */
  fillStops?: string[];
  stroke: string;
  strokeWidth: number;
  align: TextAlign;
  letterSpacing: number;
  lineHeight: number;
  uppercase: boolean;
  /** A solid box behind the words, the way a button or a name tag has one. Sizes are in canvas pixels. */
  plate?: { enabled: boolean; color: string; radius: number; padX: number; padY: number; stroke: string; strokeWidth: number };
  /** A second outline outside the first. */
  stroke2?: { enabled: boolean; color: string; width: number };
  /** Bends the line into an arc, -100 to 100. Positive arches upward. Curved text stays on one line. */
  curve?: number;
};

/** A drawn shape: a plain one such as a rounded box or a ring, or an icon such as a coin or an hourglass. */
export type ShapeLayer = Base & {
  type: 'shape';
  /** Which shape; see studio/shapes.ts. */
  shape: string;
  width: number;
  height: number;
  /** Empty for no fill. */
  fill: string;
  /** A second colour: the fill then runs from `fill` at the top to this at the bottom. */
  fill2?: string;
  stroke: string;
  strokeWidth: number;
  /** Corner radius of a box, in canvas pixels. */
  radius?: number;
  /** On a bar: how full it is, 0 to 100. `fill` is the filled part and `fill2` what is left. On rays and speed lines: how many. */
  value?: number;
  /** Mirrored left to right, so a curved arrow can point the other way. */
  flipX?: boolean;
  /** On a drawn game piece: the raised squares of a Roblox baseplate, and a band of light across the top. */
  studs?: boolean;
  gloss?: boolean;
};

export type Blend = 'screen' | 'lighter' | 'overlay' | 'source-over' | 'multiply';

export type LightLayer = Base & {
  type: 'light';
  width: number;
  height: number;
  color: string;
  blend: Blend;
};

export type Layer = ImageLayer | TextLayer | LightLayer | ShapeLayer;

export type LayerPatch = Partial<Omit<ImageLayer, 'type' | 'id'>> &
  Partial<Omit<TextLayer, 'type' | 'id'>> &
  Partial<Omit<LightLayer, 'type' | 'id'>> &
  Partial<Omit<ShapeLayer, 'type' | 'id'>>;

/** layers[0] is the bottom of the stack. */
export type Doc = {
  background: string;
  layers: Layer[];
  /** Set on a game icon: its square canvas. A thumbnail has none and is CANVAS_W × CANVAS_H. */
  size?: Size;
};

export type Size = { w: number; h: number };
export const THUMBNAIL: Size = { w: CANVAS_W, h: CANVAS_H };
export const canvasOf = (doc: Doc): Size => doc.size ?? THUMBNAIL;

export type PromptState = {
  game: string;
  genre: string;
  idea: string;
  style: string;
  hook?: string;
  /** How the main character's face should read. See the expression list in lib/thumbnail/prompt.ts. */
  expression?: string;
  /** The pose guide: 'auto', 'none', or a name from POSE_NAMES in lib/thumbnail/prompt.ts. */
  pose?: string;
  /** With an inspiration picked: allow callouts like its "+1" icons and a short label. Off unless switched on: baked-in lettering cannot be edited afterwards. */
  borrowCallouts?: boolean;
  /** With an inspiration picked: also follow its arrangement. On unless switched off. */
  borrowLayout?: boolean;
  styleReferenceId?: number;
  composition: string;
  placement: string;
  palette: string;
  customColors: string;
  lighting: string;
  textSpace: string;
  extra: string;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lockOriginals: boolean;
  doc: Doc;
  prompt: PromptState;
  thumb?: Blob;
  /** When it was last downloaded or copied out. Projects live only in the browser, so one without this is at risk. */
  exportedAt?: number;
};

export type AssetRecord = {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  /** The uploaded file, stored byte-for-byte. */
  blob: Blob;
  width: number;
  height: number;
  hasAlpha: boolean;
};
