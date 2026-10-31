'use client';

import { createContext, useContext, type RefObject } from 'react';
import type { Demo } from '@/lib/demos';
import type { Doc, ImageLayer, ImageRole, Layer, LayerPatch, PromptState } from '@/lib/types';
import type { Suggested } from './callouts';
import type { LightPreset, TextPreset } from './factory';
import type { SavedPiece } from './kit';

export type Tone = 'ok' | 'warn';
export type GenerationState = {
  phase: 'preparing' | 'generating' | 'placing' | 'ready' | 'failed';
  startedAt: number;
  /** Aborts the request. Only meaningful before the image has come back. */
  cancel?: () => void;
  /** Set with ailed. */
  message?: string;
  retry?: () => void;
  /** The chosen style inspiration, shown heavily blurred in the empty frame while waiting. */
  tint?: string;
  /** How the request was understood, known a few seconds in. Shown so a misreading can be cancelled early. */
  scene?: string;
};

/** A box on the artboard, in fractions of its width and height. */
export type Region = { x: number; y: number; w: number; h: number };

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'spread-x' | 'spread-y';

/**
 * One mode at a time. Create asks for the idea, takes shows the four results to pick from,
 * refine shows the picked one with changes in plain words, and edit brings out the manual tools.
 */
export type StudioView = 'create' | 'takes' | 'refine' | 'edit';

/** One of the four results for an idea. They are made one after another, so most wait at first. */
export type TakeSlot = { status: 'waiting' | 'making' | 'ready' | 'failed'; id?: string; scene?: string; error?: string; /** The hit game whose look this take borrowed. */ style?: string };
export type Takes = { slots: TakeSlot[]; running: boolean; stop?: () => void };

export type StudioApi = {
  view: StudioView;
  setView: (view: StudioView) => void;
  /** The takes for the latest idea while they are made and right after. Not saved: a reload shows the latest concepts instead. */
  takes: Takes | null;
  setTakes: (next: Takes | null | ((prev: Takes | null) => Takes | null)) => void;
  /** The part of the thumbnail the next change is limited to. */
  region: Region | null;
  setRegion: (region: Region | null) => void;
  /** True while the canvas is waiting for the user to drag that box. */
  marking: boolean;
  setMarking: (on: boolean) => void;
  /** The Roblox preview: open or not, and a picture of the canvas as it is now. */
  previewOpen: boolean;
  setPreviewOpen: (open: boolean) => void;
  snapshot: (width: number) => HTMLCanvasElement | null;
  projectName: string;
  /** Downloads one full thumbnail per concept id, each under Roblox's 3 MB limit. */
  exportSet: (ids: string[]) => Promise<void>;
  projectId: string;
  generation: GenerationState | null;
  setGeneration: (state: GenerationState | null) => void;
  /** Demo projects; files is set on the ones whose artwork is installed. */
  demos: Demo[];
  doc: Doc;
  selected: Layer | null;
  lockOriginals: boolean;
  prompt: PromptState;
  fontsVersion: number;
  textInputRef: RefObject<HTMLTextAreaElement | null>;

  /** True when the layer is an original asset and Protect originals is on. */
  isProtected: (layer: Layer) => boolean;
  /** `additive` adds the layer to what is selected (shift-click), or takes it out again. */
  select: (id: string | null, additive?: boolean) => void;  /** `key` groups rapid edits of the same control into one undo step. */
  update: (id: string, patch: LayerPatch, key?: string) => void;
  renameConcept: (id: string, name: string) => void;
  showConcept: (id: string) => void;
  setBackground: (color: string) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  reorder: (id: string, toIndex: number) => void;
  addFiles: (files: File[], role: ImageRole | 'auto') => Promise<void>;
  /** Adds a generated image. With `replaceId` it takes that layer's place and leaves text and other layers alone. */
  addGenerated: (file: File, replaceId?: string, source?: 'screenshot', edit?: ImageLayer['edit']) => Promise<string>;
  replaceImage: (id: string, file: File) => Promise<void>;
  addText: (preset?: TextPreset) => void;
  /** Adds several text layers in one step. `at` is the centre, as fractions of the canvas. */
  addTexts: (items: { preset: TextPreset; text?: string; at?: [number, number] }[]) => void;
  /** Callouts the inspiration suggests for the latest image, offered as layers and never drawn into it. */
  suggested: Suggested | null;
  setSuggested: (suggested: Suggested | null) => void;
  /** Adds an arrow from the kit, or changes the colour of one already on the canvas. */
  addArrow: (color: string, shape: 'straight' | 'curved') => Promise<void>;
  recolorArrow: (id: string, color: string) => Promise<void>;
  /** The text layer being typed into directly on the canvas, if any. */
  editingText: string | null;
  stopEditingText: () => void;
  /** While Arrange shows what it found: boxes around the prize and faces, as fractions of the canvas. */
  found: [number, number, number, number][] | null;
  /** Downloads the thumbnail as it is on the canvas. */
  download: () => void;
  /** Something asked for from the Download menu, for the bar under the canvas to open. `n` makes each ask distinct. */
  asked: { what: 'set' | 'compare' | 'icon'; n: number } | null;
  /** Looks at the picture on the canvas and places a label, an arrow and any plus marks on it as layers. */
  arrange: (mode?: 'suggest' | 'existing') => Promise<void>;
  arrangeStatus: string;
  arrangeBrief: string;
  arrangeError: string | null;
  setArrangeBrief: (text: string) => void;
  cancelArrange: () => void;
  arrangeReference: { name: string; image: string } | null;
  setArrangeReference: (file: File | null) => Promise<void>;
  arranging: boolean;
  /** After an arrange: the three takes to choose between, and the wordings offered for the label. */
  arranged: { takes: { id: string; name: string; preview: string; readable: boolean; usable?: boolean }[]; current: number; wordings: { kind: 'value' | 'title' | 'action'; text: string }[]; wording: string; mode: 'suggest' | 'existing'; feedback: string; references: { name: string; sourceUrl: string; image: string }[]; referenceWarning?: string } | null;
  chooseTake: (index: number) => void;
  setWording: (text: string) => void;
  clearArranged: () => void;
  addLight: (preset: LightPreset) => void;
  /** True in a game icon project: a square canvas, with nothing that only makes sense on a thumbnail. */
  isIcon: boolean;
  /** Every layer acted on together: the selected one, anything shift-clicked with it, and their groups. */
  selectionIds: string[];
  /** Ties the selected layers into one object, or frees them again. */
  group: () => void;
  ungroup: () => void;
  /** Lines the selected layers up with each other (or one layer with the canvas), or spaces three or more evenly. */
  align: (mode: AlignMode) => void;
  /** Adds a shape, or a ready-made piece from the kit, in the middle of the canvas. */
  addShape: (shape: string) => void;
  addKit: (id: string) => void;
  /** Pieces the user saved from a canvas, kept in this browser for every project. */
  saved: SavedPiece[];
  savePiece: () => void;
  addSaved: (id: string) => void;
  removeSaved: (id: string) => void;
  /** Copies a layer so it can be pasted here or into another project. */
  copyLayer: (id: string) => void;
  /** Makes everything but an image layer's subject see-through. The work happens in this browser. */
  cutout: (id: string) => Promise<void>;
  /** The layer whose background is being removed, and what to say while it is. */
  cutting: string | null;
  cutStatus: string;
  setLockOriginals: (on: boolean) => void;
  setPrompt: (patch: Partial<PromptState>) => void;
  editText: (id: string) => void;
  notify: (message: string, tone?: Tone) => void;
};

export const StudioContext = createContext<StudioApi | null>(null);

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside the studio');
  return ctx;
}
