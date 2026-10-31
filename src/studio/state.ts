import type { Doc, Layer, LayerPatch } from '@/lib/types';

export type State = {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  selectedId: string | null;
  /** Consecutive edits with the same key (a slider drag, typing) collapse into one undo step. */
  lastKey: string | null;
  lastAt: number;
  /** Counts edits since load; drives autosave. */
  rev: number;
};

export type Action =
  | { type: 'load'; doc: Doc }
  | { type: 'apply'; fn: (doc: Doc) => Doc; key?: string; at: number }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

/** Activates one saved image version, keeping added text and other layers intact. */
export function activateConcept(doc: Doc, id: string): Doc {
  if (!doc.layers.some(l => l.type === 'image' && l.name === 'AI thumbnail' && l.id === id)) return doc;
  if (doc.layers.every(l => l.type !== 'image' || l.name !== 'AI thumbnail' || l.visible === (l.id === id))) return doc;
  return { ...doc, layers: doc.layers.map(l => l.type === 'image' && l.name === 'AI thumbnail' ? { ...l, visible: l.id === id } : l) };
}

export const emptyDoc = (): Doc => ({ background: '#FFFFFF', layers: [] });

export const initialState: State = {
  doc: emptyDoc(),
  past: [],
  future: [],
  selectedId: null,
  lastKey: null,
  lastAt: 0,
  rev: 0,
};

const keepSelection = (doc: Doc, id: string | null) => (id && doc.layers.some((l) => l.id === id) ? id : null);

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'load':
      return { ...initialState, doc: a.doc };
    case 'select':
      return s.selectedId === a.id ? s : { ...s, selectedId: a.id, lastKey: null };
    case 'apply': {
      const doc = a.fn(s.doc);
      if (doc === s.doc) return s;
      const merge = !!a.key && a.key === s.lastKey && a.at - s.lastAt < COALESCE_MS;
      return {
        ...s,
        doc,
        past: merge ? s.past : [...s.past, s.doc].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: a.key ?? null,
        lastAt: a.at,
        rev: s.rev + 1,
        selectedId: keepSelection(doc, s.selectedId),
      };
    }
    case 'undo': {
      const doc = s.past[s.past.length - 1];
      if (!doc) return s;
      return {
        ...s,
        doc,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        lastKey: null,
        rev: s.rev + 1,
        selectedId: keepSelection(doc, s.selectedId),
      };
    }
    case 'redo': {
      const doc = s.future[0];
      if (!doc) return s;
      return {
        ...s,
        doc,
        past: [...s.past, s.doc],
        future: s.future.slice(1),
        lastKey: null,
        rev: s.rev + 1,
        selectedId: keepSelection(doc, s.selectedId),
      };
    }
  }
}

// ---- pure document operations

export function patchLayer(doc: Doc, id: string, patch: LayerPatch): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function insertLayer(doc: Doc, layer: Layer, index?: number): Doc {
  const layers = doc.layers.slice();
  layers.splice(index ?? layers.length, 0, layer);
  return { ...doc, layers };
}

export function removeLayer(doc: Doc, id: string): Doc {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function moveLayer(doc: Doc, id: string, to: number): Doc {
  const from = doc.layers.findIndex((l) => l.id === id);
  const target = Math.max(0, Math.min(doc.layers.length - 1, to));
  if (from < 0 || from === target) return doc;
  const layers = doc.layers.slice();
  const [layer] = layers.splice(from, 1);
  layers.splice(target, 0, layer);
  return { ...doc, layers };
}
