'use client';


import { Check, ChevronDown, CircleCheck, Download, Eye, FolderOpen, Frame, Layers, LayoutGrid, Maximize, Minus, Moon, MoreHorizontal, PanelRight, SlidersHorizontal, Sun, Plus, Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AccountMenu from '@/components/AccountMenu';
import { Mark } from '@/components/Logo';
import { getLoadedAsset, importImage, loadAsset } from '@/lib/assets';
import { deleteAsset, getAsset, getProject, getAttachments, listProjectAssets, putProject } from '@/lib/db';
import type { Demo } from '@/lib/demos';
import { takeFiles, takePlan } from '@/lib/handoff';
import { loadEditorFonts } from '@/lib/fonts';
import { defaultPrompt } from '@/lib/prompt';
import { CANVAS_H, CANVAS_W, ICON_EXPORT, ICON_SIZE, canvasOf, type AssetRecord, type Doc, type ImageLayer, type ImageRole, type Layer, type LayerPatch, type PromptState, type TextLayer } from '@/lib/types';
import { canvasToBlob, clamp, downloadBlob, slug, uid } from '@/lib/util';
import CanvasStage, { type CanvasHandle, type Zoom } from './CanvasStage';
import { StudioContext, type AlignMode, type GenerationState, type StudioApi, type StudioView, type Takes, type Tone, type Region } from './context';
import TakesGrid, { CreateIntro } from './Modes';
import { IconBtn } from './controls';
import { buildDemoDoc, fetchDemoFile } from './demo';
import { imagePlacement, makeImageLayer, makeLightLayer, makeShapeLayer, makeTextLayer, type LightPreset, type TextPreset } from './factory';
import { boundsOf, getCenter, layerSize, originForCenter } from './geometry';
import { KIT, placeCopies, savedPieces, storePieces, type SavedPiece } from './kit';
import { arrowFile, type Suggested } from './callouts';
import TakesBar from './TakesBar';
import { aimArrow, buildTakes, previewTake, readPixels, requestPlan, reviewTakes, smallCopy, describeLayer, layerRect, type ArrangeInput, type Plan, type Take } from './arrange';
import Composer from './Composer';
import { TOOL_KEYS, ToolPanel, ToolSwitch, type Tool } from './SimpleTools';
import { StudioSplash } from './StudioSplash';
import { activateConcept, emptyDoc, initialState, insertLayer, moveLayer, patchLayer, reducer, removeLayer } from './state';
import { removeBackground } from './cutout';
import RobloxPreview from './RobloxPreview';
import type { ReferenceGame } from '@/lib/thumbnail/references';
import { usePresence } from './usePresence';
import { applyExistingLayout } from './arrangePlan';

/** Roblox's size limit for thumbnails that take part in personalization. */
const SET_LIMIT = 3 * 1024 * 1024;
type Meta = { id: string; name: string; createdAt: number; lockOriginals: boolean; prompt: PromptState; exportedAt?: number };

/** A copied layer waits here; the system clipboard only carries a marker that says which one. */
const CLIP_KEY = 'bopzi:layer';
const CLIP_MARK = 'bopzi-layer:';
/** The given layers, plus every other layer that shares a group with one of them, in stacking order. */
function withGroups(doc: Doc, ids: (string | null)[]) {
  const direct = new Set(ids);
  const groups = new Set(doc.layers.flatMap((l) => (direct.has(l.id) && l.groupId ? [l.groupId] : [])));
  return doc.layers.filter((l) => direct.has(l.id) || (!!l.groupId && groups.has(l.groupId))).map((l) => l.id);
}
const idle = () => {};
/** What changes the width of a line of text. */
const TEXT_WIDTH_KEYS: (keyof LayerPatch)[] = ['text', 'font', 'fontSize', 'letterSpacing', 'uppercase'];
const isUntitled = (name: string) => /^Untitled (thumbnail|icon)$/.test(name);
/** "blue_dragon-v2.png" names a project; "image.png" or "Screenshot (12).png" does not. */
function nameFromFile(file: string) {
  const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48);
  if (base.length < 3 || /^(image|img|screenshot|screen shot|robloxscreenshot|capture|photo|pasted|untitled|download)?[\s\d().]*$/i.test(base)) return '';
  return base[0].toUpperCase() + base.slice(1);
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl Z', 'Undo'],
  ['Ctrl Shift Z', 'Redo'],
  ['Ctrl S', 'Save now'],
  ['Ctrl C', 'Copy the selected layer'],
  ['Ctrl V', 'Paste a layer or an image'],
  ['Ctrl D', 'Duplicate'],
  ['Shift + click', 'Select several layers'],
  ['Ctrl G  /  Ctrl Shift G', 'Group / ungroup'],
  ['Delete', 'Delete the selected layer'],
  ['Arrows', 'Nudge by 1 px (Shift: 10 px)'],
  ['Ctrl ]  /  Ctrl [', 'Bring forward / send backward'],
  ['Alt + drag', 'Move without snapping'],
  ['Double-click', 'Edit text on the canvas'],
  ['Right-click', 'Layer menu'],
  ['Esc', 'Deselect'],
  ['V  /  T  /  K  /  L', 'Edit, Text, Kit, Light'],
  ['?', 'Show this list'],
];
type SaveState = 'new' | 'pending' | 'saving' | 'saved' | 'error';

const SAVE_DELAY = 700;
// What Protect originals refuses to change on a protected layer.
const PROTECTED_KEYS: (keyof LayerPatch)[] = ['assetId', 'width', 'height', 'flipX', 'opacity', 'role', 'original'];

const SAVE_LABEL: Record<SaveState, string> = {
  new: 'Not saved',
  pending: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
};

const SAVE_DOT: Record<SaveState, string> = {
  new: 'bg-ui-dim/60',
  pending: 'bg-ui-dim animate-pulse',
  saving: 'bg-ui-dim animate-pulse',
  saved: 'bg-ok',
  error: 'bg-danger',
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export default function Studio({ demos }: { demos: Demo[] }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaRev, setMetaRev] = useState(0);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [scale, setScale] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>('new');
  const stored = useRef(false);
  const [fontsVersion, setFontsVersion] = useState(0);
  const [tool, setTool] = useState<Tool | null>(null);
  // The side panel stays docked unless it is put away; the choice is kept between visits.
  const [panel, setPanel] = useState(true);
  useEffect(() => { try { setPanel(localStorage.getItem('bopzi-studio-panel') !== 'hidden'); } catch {} }, []);
  const togglePanel = () => setPanel(v => { try { localStorage.setItem('bopzi-studio-panel', v ? 'hidden' : 'shown'); } catch {} return !v; });
  // Picking a tool brings the panel back, and the manual tools with it.
  const pickTool = useCallback((next: Tool | null) => { setTool(next); if (next) setPanel(true); setViewState('edit'); }, []);
  const [conceptDock, setConceptDock] = useState<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [generation, setGeneration] = useState<GenerationState | null>(null);
  const [dark, setDark] = useState(true);
  const [propertiesRequest, setPropertiesRequest] = useState(0);
  useEffect(() => { try { setDark(localStorage.getItem('bopzi-studio-theme') !== 'light'); } catch {} }, []);
  const toggleTheme = () => setDark(v => { try { localStorage.setItem('bopzi-studio-theme', v ? 'light' : 'dark'); } catch {} return !v; });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [guides, setGuides] = useState(false);
  // One mode at a time; see StudioView.
  const [view, setViewState] = useState<StudioView>('refine');
  const [takes, setTakes] = useState<Takes | null>(null);
  const setView = useCallback((next: StudioView) => setViewState(next), []);
  // A project opens where it left off: an empty one asks for the idea, one with artwork shows it.
  const openedId = meta?.id;
  const openedDoc = state.doc;
  useEffect(() => {
    if (!openedId) return;
    const startCanvas = !openedDoc.layers.length && new URLSearchParams(window.location.search).get('start') === 'canvas';
    setViewState(startCanvas ? 'edit' : openedDoc.layers.length ? 'refine' : 'create');
    setTakes(null);
    // Only when a project opens; later edits to the doc must not move the studio between modes.
  }, [openedId]);
  // Selecting something on the canvas is asking to edit it by hand.
  useEffect(() => {
    if (state.selectedId) setViewState(v => (v === 'refine' || v === 'takes' ? 'edit' : v));
  }, [state.selectedId]);
  const [region, setRegion] = useState<Region | null>(null);
  const [marking, setMarking] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);
  const snapshot = useCallback((width: number) => canvasRef.current?.toCanvas(width) ?? null, []);
  // The real games an icon is shown beside. Fetched the first time an icon project opens its Roblox preview.
  const [iconGames, setIconGames] = useState<ReferenceGame[]>([]);
  const isIconProject = !!state.doc.size;
  useEffect(() => {
    if (!previewOpen || !isIconProject || iconGames.length) return;
    let alive = true;
    fetch('/api/thumbnail/references').then((r) => (r.ok ? r.json() : null)).then((body) => { if (alive && Array.isArray(body?.games)) setIconGames(body.games); }).catch(() => {});
    return () => { alive = false; };
  }, [previewOpen, isIconProject, iconGames.length]);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const thumbRef = useRef<Blob | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handed = useRef<File[]>([]);
  const latest = useRef({ state, meta });
  useEffect(() => {
    latest.current = { state, meta };
  });

  const notify = useCallback((message: string, tone: Tone = 'ok') => setToast({ id: Date.now(), message, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === 'warn' ? 5200 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- open the project named in the URL, or start a new one
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams(window.location.search);
    const fresh = (): Meta => ({
      id: uid('p'),
      name: 'Untitled thumbnail',
      createdAt: Date.now(),
      lockOriginals: true,
      prompt: { ...defaultPrompt(query.get('genre') ?? undefined), idea: (query.get('idea') ?? '').slice(0, 4000) },
    });
    (async () => {
      const id = query.get('p');
      // Always yield once, so a discarded first mount never consumes the landing-page handoff.
      const saved = id ? await getProject(id).catch(() => undefined) : await Promise.resolve(undefined);
      if (!alive) return;
      if (!saved) {
        if (id) notify('That project is not saved in this browser, so a new one was started.', 'warn');
        if (id) window.history.replaceState(null, '', '/studio');
        const next = fresh();

        // A demo always becomes a brand-new project with its own copies of the artwork.
        const demoId = query.get('demo');
        if (demoId) {
          const demo = demos.find((d) => d.id === demoId);
          try {
            if (!demo?.files) throw new Error('missing');
            const [bg, ch] = await Promise.all([
              fetchDemoFile(demo.files.background, `${demo.id}-background`),
              fetchDemoFile(demo.files.character, `${demo.id}-character`),
              loadEditorFonts(),
            ]);
            if (!alive) return;
            const bgRec = await importImage(bg, next.id);
            const chRec = await importImage(ch, next.id);
            const built = buildDemoDoc(demo, bgRec, chRec);
            dispatch({ type: 'load', doc: built.doc });
            dispatch({ type: 'select', id: built.selectId });
            setMeta({ ...next, name: `${demo.name} demo`, prompt: { ...next.prompt, ...demo.prompt } });
            setMetaRev(1); // saves it straight away, which also swaps ?demo for ?p in the URL
            return;
          } catch {
            if (!alive) return;
            notify('That demo is not available here, so an empty project was started.', 'warn');
            window.history.replaceState(null, '', '/studio');
          }
        }

        // A game icon is its own project, on a square canvas.
        if (query.get('format') === 'icon') {
          dispatch({ type: 'load', doc: { ...emptyDoc(), size: { w: ICON_SIZE, h: ICON_SIZE } } });
          setMeta({ ...next, name: 'Untitled icon' });
          return;
        }

        const plan = takePlan();
        if (plan) next.prompt = { ...defaultPrompt(plan.genre || undefined), idea: plan.idea };
        handed.current = takeFiles();
        setMeta(next);
        return;
      }
      stored.current = true;
      thumbRef.current = saved.thumb;
      dispatch({ type: 'load', doc: saved.doc });
      setMeta({ id: saved.id, name: saved.name, createdAt: saved.createdAt, lockOriginals: saved.lockOriginals, prompt: { ...defaultPrompt(), ...saved.prompt }, exportedAt: saved.exportedAt });
      setSaveState('saved');
      // Image files dropped from the document in an earlier session are no longer reachable through undo.
      const used = new Set(saved.doc.layers.flatMap((l) => (l.type === 'image' ? [l.assetId] : [])));
      for (const a of await listProjectAssets(saved.id).catch(() => [])) if (!used.has(a.id)) deleteAsset(a.id).catch(() => {});
    })();
    return () => {
      alive = false;
    };
    // The demo list comes from the server once and never changes.
  }, [notify, demos]);

  useEffect(() => {
    loadEditorFonts().then(() => setFontsVersion((v) => v + 1));
  }, []);

  // ---- autosave to IndexedDB
  const save = useCallback(async (withThumb: boolean) => {
    const { state: st, meta: m } = latest.current;
    if (!m) return false;
    // A project starts existing when it has something in it; opening the studio makes nothing.
    if (!stored.current && !st.doc.layers.length) { setSaveState('new'); return true; }
    setSaveState('saving');
    try {
      if (withThumb) {
        const canvas = canvasRef.current?.toCanvas(480);
        if (canvas) thumbRef.current = await canvasToBlob(canvas, 'image/jpeg', 0.82);
      }
      await putProject({ ...m, updatedAt: Date.now(), doc: st.doc, thumb: thumbRef.current });
      stored.current = true;
      if (!window.location.search.includes(m.id)) window.history.replaceState(null, '', `/studio?p=${m.id}`);
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, []);

  useEffect(() => {
    if (state.rev === 0 && metaRev === 0) return;
    setSaveState('pending');
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      save(true);
    }, SAVE_DELAY);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.rev, metaRev, save]);

  // Leaving the page or the tab: write whatever is still waiting.
  useEffect(() => {
    const flush = () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      save(false);
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  // ---- actions
  const apply = useCallback((fn: (doc: Doc) => Doc, key?: string) => {
    dispatch({ type: 'apply', fn, key, at: Date.now() });
  }, []);

  const patchMeta = useCallback((patch: Partial<Meta>) => {
    setMeta((m) => (m ? { ...m, ...patch } : m));
    setMetaRev((v) => v + 1);
  }, []);

  const isProtected = useCallback((l: Layer) => l.type === 'image' && l.original && !!meta?.lockOriginals, [meta?.lockOriginals]);

  // ---- selection: one layer leads; shift-clicked layers and the rest of its group come along with it
  const [picked, setPicked] = useState<string[]>([]);
  const selectionIds = useMemo(() => withGroups(state.doc, [state.selectedId, ...picked]), [state.doc, state.selectedId, picked]);
  const selection = useRef(selectionIds);
  selection.current = selectionIds;
  /** Everything an action on `id` applies to: the whole selection when it is part of it, else its own group. */
  const familyOf = useCallback((id: string) => (selection.current.includes(id) ? selection.current : withGroups(latest.current.state.doc, [id])), []);

  const select = useCallback((id: string | null, additive = false) => {
    const lead = latest.current.state.selectedId;
    if (id && additive && lead && lead !== id) {
      // Shift-click adds a layer to what is selected, or takes it out again.
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...new Set([...p, lead, id])]));
      return;
    }
    // Pressing on something already selected (to drag it) keeps the rest selected too.
    if (!id || !selection.current.includes(id)) setPicked([]);
    dispatch({ type: 'select', id });
  }, []);
  const update = useCallback(
    (id: string, patch: LayerPatch, key?: string) => {
      const lock = !!latest.current.meta?.lockOriginals;
      apply((doc) => {
        const layer = doc.layers.find((l) => l.id === id);
        if (!layer) return doc;
        let next = patch;
        if (layer.type === 'image' && layer.original && lock) {
          next = { ...patch };
          for (const k of PROTECTED_KEYS) delete next[k];
          // Resizing a protected original always keeps its proportions.
          if (next.scaleX !== undefined || next.scaleY !== undefined) {
            const k = Math.abs(next.scaleX ?? next.scaleY ?? 1);
            const ratio = Math.abs(layer.scaleY / layer.scaleX) || 1;
            next.scaleX = k;
            next.scaleY = k * ratio;
          }
          if (Object.keys(next).length === 0) return doc;
        }
        // New words, a new font or a new size change how wide a line is. It grows from the side it is aligned to,
        // so a centred title stays centred and a right-aligned one keeps its right edge.
        if (layer.type === 'text' && layer.align !== 'left' && next.x === undefined && next.y === undefined && TEXT_WIDTH_KEYS.some((k) => k in next)) {
          const spare = (layerSize(layer).w - layerSize({ ...layer, ...next } as TextLayer).w) * (layer.align === 'center' ? 0.5 : 1);
          const turn = (layer.rotation * Math.PI) / 180;
          next = { ...next, x: layer.x + spare * Math.cos(turn), y: layer.y + spare * Math.sin(turn) };
        }
        return patchLayer(doc, id, next);
      }, key);
    },
    [apply],
  );

  const remove = useCallback(
    (id: string) => {
      const { state: st, meta: m } = latest.current;
      const family = familyOf(id);
      const guarded = (l: Layer) => l.type === 'image' && l.original && !!m?.lockOriginals;
      const going = st.doc.layers.filter((l) => family.includes(l.id) && !guarded(l)).map((l) => l.id);
      if (!going.length) {
        if (family.length) notify('That is a protected original. Turn off Protect originals to delete it.', 'warn');
        return;
      }
      apply((doc) => ({ ...doc, layers: doc.layers.filter((l) => !going.includes(l.id)) }));
    },
    [apply, notify, familyOf],
  );

  const duplicate = useCallback(
    (id: string) => {
      const family = familyOf(id);
      const layers = latest.current.state.doc.layers.filter((l) => family.includes(l.id));
      if (!layers.length) return;
      // Copies of a group are a group of their own, so the two can be moved apart.
      const groupId = layers.length > 1 ? uid('g') : undefined;
      const copies: Layer[] = layers.map((layer) => ({ ...layer, id: uid('l'), x: layer.x + 40, y: layer.y + 40, locked: false, shadow: { ...layer.shadow }, glow: { ...layer.glow }, groupId }));
      apply((doc) => {
        const at = Math.max(...layers.map((l) => doc.layers.findIndex((x) => x.id === l.id))) + 1;
        const next = doc.layers.slice();
        next.splice(at, 0, ...copies);
        return { ...doc, layers: next };
      });
      setPicked(groupId ? [] : copies.map((c) => c.id));
      dispatch({ type: 'select', id: copies[0].id });
    },
    [apply, familyOf],
  );

  // ---- groups
  const group = useCallback(() => {
    const ids = selection.current;
    if (ids.length < 2) return;
    const groupId = uid('g');
    apply((doc) => ({ ...doc, layers: doc.layers.map((l) => (ids.includes(l.id) ? { ...l, groupId } : l)) }));
    setPicked([]);
    notify('Grouped. They now move, resize and copy as one.');
  }, [apply, notify]);
  const ungroup = useCallback(() => {
    const ids = selection.current;
    apply((doc) => (doc.layers.some((l) => ids.includes(l.id) && l.groupId) ? { ...doc, layers: doc.layers.map((l) => (ids.includes(l.id) ? { ...l, groupId: undefined } : l)) } : doc));
    setPicked([]);
  }, [apply]);

  /** Puts ready-made layers on the canvas in one step and selects them. */
  const addLayers = useCallback((layers: Layer[]) => {
    if (!layers.length) return;
    apply((doc) => ({ ...doc, layers: [...doc.layers, ...layers] }));
    setPicked(layers[0].groupId ? [] : layers.map((l) => l.id));
    dispatch({ type: 'select', id: layers[0].id });
  }, [apply]);
  const addShape = useCallback((shape: string) => addLayers([makeShapeLayer(shape, {}, canvasOf(latest.current.state.doc))]), [addLayers]);
  const addKit = useCallback((id: string) => {
    const item = KIT.find(k => k.id === id);
    if (!item) return;
    const canvas = canvasOf(latest.current.state.doc);
    const pieces = item.build(canvas);
    if (item.artworkDim === undefined) { addLayers(pieces); return; }
    const dim = makeShapeLayer('box', { name: 'Timer artwork dimming', width: canvas.w, height: canvas.h, x: 0, y: 0, fill: '#000000', strokeWidth: 0, opacity: item.artworkDim }, canvas);
    apply(doc => {
      // Existing text and callouts retain their brightness; only the underlying artwork is veiled.
      const background = doc.layers.findLastIndex(layer => layer.type === 'image' && (layer.role === 'background' || layer.original));
      const artwork = background >= 0 ? background : doc.layers.findLastIndex(layer => layer.type === 'image');
      const layers = doc.layers.slice();
      layers.splice(artwork + 1, 0, dim);
      return { ...doc, layers: [...layers, ...pieces] };
    });
    setPicked([]);
    dispatch({ type: 'select', id: pieces[0].id });
    notify('Timer added. Ungroup to edit its text and outline. Select Timer artwork dimming in Layers to adjust its opacity.');
  }, [addLayers, apply, notify]);

  // ---- pieces saved from the canvas, kept in this browser for any project
  const [saved, setSaved] = useState<SavedPiece[]>([]);
  useEffect(() => setSaved(savedPieces()), []);
  const keepPieces = useCallback((next: SavedPiece[]) => {
    try { storePieces(next); setSaved(next); return true; } catch { notify('That could not be saved in this browser.', 'warn'); return false; }
  }, [notify]);
  const savePiece = useCallback(() => {
    const ids = selection.current;
    const layers = latest.current.state.doc.layers.filter((l) => ids.includes(l.id));
    if (!layers.length) return;
    if (layers.some((l) => l.type === 'image')) { notify('Pictures cannot be saved in a kit yet. Save the shapes and text without them.', 'warn'); return; }
    const title = layers.find((l) => l.type === 'text');
    const name = (title?.type === 'text' ? title.text.replace(/\s+/g, ' ').trim().slice(0, 24) : '') || layers[0].name;
    if (keepPieces([{ id: uid('k'), name, layers }, ...savedPieces()].slice(0, 40))) notify(`Saved “${name}” to My kit.`);
  }, [keepPieces, notify]);
  const addSaved = useCallback((id: string) => {
    const piece = savedPieces().find((p) => p.id === id);
    if (piece) addLayers(placeCopies(piece.layers, canvasOf(latest.current.state.doc), (l) => ({ x: l.x, y: l.y, ...layerSize(l) })));
  }, [addLayers]);
  const removeSaved = useCallback((id: string) => void keepPieces(savedPieces().filter((p) => p.id !== id)), [keepPieces]);

  const reorder = useCallback((id: string, to: number) => {
    const family = familyOf(id);
    apply((doc) => {
      if (family.length < 2) return moveLayer(doc, id, to);
      // A group, or several selected layers, move through the stack as one block and keep their own order.
      const inFamily = (l: Layer) => family.includes(l.id);
      const from = doc.layers.findIndex((l) => l.id === id);
      const others = doc.layers.filter((l) => !inFamily(l));
      const members = doc.layers.filter(inFamily);
      /** How many of the other layers sit below that place in the stack. */
      const below = (index: number) => doc.layers.slice(0, index).filter((l) => !inFamily(l)).length;
      const first = doc.layers.findIndex(inFamily);
      const last = doc.layers.length - 1 - [...doc.layers].reverse().findIndex(inFamily);
      /** How many of the other layers one step passes, starting at `at` and going `dir`: one layer, or the whole group it belongs to. */
      const stride = (at: number, dir: 1 | -1) => {
        const groupId = others[at]?.groupId;
        let n = others[at] ? 1 : 0;
        while (groupId && others[at + n * dir]?.groupId === groupId) n++;
        return n;
      };
      // One step passes the next layer or group that is not part of the block; anything further lands where it was aimed.
      const above = below(last), under = below(first);
      const slot = clamp(to - from === 1 ? above + stride(above, 1) : to - from === -1 ? under - stride(under - 1, -1) : below(to > from ? to + 1 : to), 0, others.length);
      const layers = [...others.slice(0, slot), ...members, ...others.slice(slot)];
      return layers.every((l, i) => l === doc.layers[i]) ? doc : { ...doc, layers };
    });
  }, [apply, familyOf]);

  // ---- lining layers up with each other, or one layer with the canvas
  const align = useCallback((mode: AlignMode) => {
    const doc = latest.current.state.doc;
    const picked = doc.layers.filter((l) => selection.current.includes(l.id) && !l.locked);
    if (!picked.length) return;
    // A group moves as one piece. With only one group selected, it is the layers inside it that are lined up.
    const byGroup = new Map<string, Layer[]>();
    for (const l of picked) byGroup.set(l.groupId ?? l.id, [...(byGroup.get(l.groupId ?? l.id) ?? []), l]);
    let units = [...byGroup.values()];
    if (units.length === 1 && units[0].length > 1) units = units[0].map((l) => [l]);
    const around = (boxes: ReturnType<typeof boundsOf>[]) => ({ left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)) });
    const boxes = units.map((unit) => around(unit.map(boundsOf)));
    const canvas = canvasOf(doc);
    // Several pieces line up with each other; a single one lines up with the canvas.
    const frame = units.length > 1 ? around(boxes) : { left: 0, top: 0, right: canvas.w, bottom: canvas.h };
    const moves = new Map<string, { dx: number; dy: number }>();
    const move = (unit: Layer[], dx: number, dy: number) => unit.forEach((l) => moves.set(l.id, { dx, dy }));
    if (mode === 'spread-x' || mode === 'spread-y') {
      if (units.length < 3) { notify('Select three or more layers to space them evenly.', 'warn'); return; }
      const across = mode === 'spread-x';
      const start = (b: typeof frame) => (across ? b.left : b.top), size = (b: typeof frame) => (across ? b.right - b.left : b.bottom - b.top);
      const order = units.map((unit, i) => ({ unit, box: boxes[i] })).sort((a, b) => start(a.box) + size(a.box) / 2 - (start(b.box) + size(b.box) / 2));
      // The first and last stay put; the gaps between all of them are made equal.
      const gap = (size(frame) - order.reduce((sum, o) => sum + size(o.box), 0)) / (order.length - 1);
      let at = start(frame);
      for (const o of order) {
        const shift = at - start(o.box);
        move(o.unit, across ? shift : 0, across ? 0 : shift);
        at += size(o.box) + gap;
      }
    } else {
      units.forEach((unit, i) => {
        const b = boxes[i];
        const dx = mode === 'left' ? frame.left - b.left : mode === 'right' ? frame.right - b.right : mode === 'center' ? (frame.left + frame.right - b.left - b.right) / 2 : 0;
        const dy = mode === 'top' ? frame.top - b.top : mode === 'bottom' ? frame.bottom - b.bottom : mode === 'middle' ? (frame.top + frame.bottom - b.top - b.bottom) / 2 : 0;
        move(unit, dx, dy);
      });
    }
    apply((d) => ({ ...d, layers: d.layers.map((l) => { const m = moves.get(l.id); return m && (m.dx || m.dy) ? { ...l, x: Math.round(l.x + m.dx), y: Math.round(l.y + m.dy) } : l; }) }));
  }, [apply, notify]);

  const addFiles = useCallback(
    async (files: File[], role: ImageRole | 'auto') => {
      const m = latest.current.meta;
      if (!m || files.length === 0) return;
      for (const file of files) {
        try {
          const rec = await importImage(file, m.id);
          const layers = latest.current.state.doc.layers;
          const hasBackground = layers.some((l) => l.type === 'image' && l.role === 'background');
          const as: ImageRole = role !== 'auto' ? role : rec.hasAlpha ? 'character' : hasBackground ? 'image' : 'background';
          const layer = makeImageLayer(rec, as, canvasOf(latest.current.state.doc));
          apply((doc) => {
            if (as !== 'background') return insertLayer(doc, layer);
            // A new background goes above older backgrounds and below everything else.
            let at = 0;
            doc.layers.forEach((l, i) => {
              if (l.type === 'image' && l.role === 'background') at = i + 1;
            });
            return insertLayer(doc, layer, at);
          });
          select(layer.id);
          // The first named file names the project, so the list of projects is not a row of "Untitled".
          const title = isUntitled(latest.current.meta?.name ?? '') ? nameFromFile(file.name) : '';
          if (title) patchMeta({ name: title });
          if (as === 'character') {
            notify(
              rec.hasAlpha
                ? 'Added as a protected original. The file is stored untouched.'
                : 'Added as a protected original. This file has no transparency, so its background will show.',
              rec.hasAlpha ? 'ok' : 'warn',
            );
          } else if (role === 'auto') {
            notify(as === 'background' ? 'Added as the background.' : 'Added as an image layer.');
          }
        } catch (err) {
          notify(err instanceof Error ? err.message : 'That file could not be added.', 'warn');
        }
      }
    },
    [apply, notify, select, patchMeta],
  );

  const addGenerated = useCallback(async (file: File, replaceId?: string, source?: 'screenshot', edit?: ImageLayer['edit']) => {
    const m = latest.current.meta;
    if (!m) throw new Error('The project is still opening.');
    // A project still called "Untitled" takes the first few words of what was asked for.
    const words = m.prompt.idea.trim().split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?]+$/, '').slice(0, 48);
    if (isUntitled(m.name) && words.length >= 3) patchMeta({ name: words[0].toUpperCase() + words.slice(1) });
    const rec = await importImage(file, m.id);
    const layer = { ...makeImageLayer(rec, 'background', latest.current.state.doc.size), name: 'AI thumbnail', ...(edit ? { edit } : {}), ...(source ? { source, original: true, conceptName: 'Screenshot' } : {}) };
    apply(doc => {
      const at = replaceId ? doc.layers.findIndex(l => l.id === replaceId) : -1;
      // A refined image slots in above the one it came from, so titles and other layers stay as they were.
      if (at >= 0) {
        const from = doc.layers[at];
        const layers = doc.layers.map(l => (l.id === replaceId ? { ...l, visible: false } : l));
        // It stays tied to the concept it was changed from, so the two show as versions of one thing.
        layers.splice(at + 1, 0, { ...layer, source: from.type === 'image' ? from.source : undefined, conceptId: (from.type === 'image' && from.conceptId) || from.id, conceptName: from.type === 'image' ? from.conceptName : undefined });
        return { ...doc, layers };
      }
      return { ...doc, layers: [...doc.layers.map(l => ({ ...l, visible: false })), layer] };
    });
    select(null);
    return layer.id;
  }, [apply, select, patchMeta]);

  // Images chosen on the landing page arrive once the new project exists.
  useEffect(() => {
    if (!meta || handed.current.length === 0) return;
    const files = handed.current;
    handed.current = [];
    addFiles(files, 'auto');
  }, [meta, addFiles]);

  const replaceImage = useCallback(
    async (id: string, file: File) => {
      const { state: st, meta: m } = latest.current;
      const layer = st.doc.layers.find((l) => l.id === id);
      if (!m || !layer || layer.type !== 'image') return;
      if (layer.original && m.lockOriginals) {
        notify('That is a protected original. Turn off Protect originals to replace it.', 'warn');
        return;
      }
      try {
        const rec = await importImage(file, m.id);
        // Keep the layer where it is and at roughly the same height.
        const swapped: Layer = { ...layer, assetId: rec.id, width: rec.width, height: rec.height };
        const fit =
          layer.role === 'background'
            ? imagePlacement(rec.width, rec.height, 'background', canvasOf(st.doc))
            : (() => {
                const k = (layer.height * Math.abs(layer.scaleY)) / rec.height;
                const next = { ...swapped, scaleX: k, scaleY: k };
                return { scaleX: k, scaleY: k, ...originForCenter(next, getCenter(layer)) };
              })();
        apply((doc) => patchLayer(doc, id, { assetId: rec.id, width: rec.width, height: rec.height, ...fit }));
        notify('Image replaced.');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'That file could not be used.', 'warn');
      }
    },
    [apply, notify],
  );

  // ---- background removal
  const [cut, setCut] = useState<{ id: string; status: string } | null>(null);
  const cutout = useCallback(async (id: string) => {
    const { state: st, meta: m } = latest.current;
    const layer = st.doc.layers.find((l) => l.id === id);
    if (!m || !layer || layer.type !== 'image' || layer.arrow) return;
    setCut({ id, status: 'Removing the background' });
    try {
      const source = getLoadedAsset(layer.assetId) ?? (await loadAsset(layer.assetId));
      if (!source) throw new Error('The source file for this layer is no longer in this browser.');
      const png = await removeBackground(source.record.blob, (percent) => setCut({ id, status: percent < 100 ? `Getting the remover ready ${Math.round(percent)}%` : 'Removing the background' }));
      const rec = await importImage(new File([png], `${source.record.name.replace(/\.[a-z0-9]+$/i, '')}-cutout.png`, { type: 'image/png' }), m.id);
      // The user asked for exactly this change, so it goes through even on a protected original. Undo brings the first file back.
      apply((doc) => patchLayer(doc, id, { assetId: rec.id, width: rec.width, height: rec.height, ...(layer.role === 'background' ? { role: 'image' as ImageRole } : {}) }));
      notify(rec.hasAlpha ? 'Background removed. Undo brings it back.' : 'No clear subject was found, so nothing was removed.', rec.hasAlpha ? 'ok' : 'warn');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The background could not be removed.', 'warn');
    } finally {
      setCut(null);
    }
  }, [apply, notify]);

  const addText = useCallback(
    (preset?: TextPreset) => {
      const layer = makeTextLayer(preset, undefined, canvasOf(latest.current.state.doc));
      apply((doc) => insertLayer(doc, layer));
      select(layer.id);
    },
    [apply, select],
  );

  const addTexts = useCallback(
    (items: { preset: TextPreset; text?: string; at?: [number, number] }[]) => {
      const canvas = canvasOf(latest.current.state.doc);
      const layers = items.map((item) => makeTextLayer(item.preset, { text: item.text, center: item.at && { x: item.at[0] * canvas.w, y: item.at[1] * canvas.h } }, canvas));
      if (!layers.length) return;
      apply((doc) => layers.reduce((d, layer) => insertLayer(d, layer), doc));
      select(layers[layers.length - 1].id);
    },
    [apply, select],
  );
  const [suggested, setSuggested] = useState<Suggested | null>(null);

  // ---- arrows from the kit
  const addArrow = useCallback(async (color: string, shape: 'straight' | 'curved') => {
    const m = latest.current.meta;
    if (!m) return;
    const rec = await importImage(await arrowFile(color, 'Arrow', shape), m.id);
    const layer: ImageLayer = { ...makeImageLayer(rec, 'image'), name: 'Arrow', arrow: { shape, color } };
    // A sensible size to start from, in the middle of the canvas.
    const canvas = canvasOf(latest.current.state.doc);
    const k = 0.6 * (canvas.w / CANVAS_W);
    Object.assign(layer, { scaleX: k, scaleY: k, x: Math.round((canvas.w - rec.width * k) / 2), y: Math.round((canvas.h - rec.height * k) / 2) });
    apply((doc) => insertLayer(doc, layer));
    select(layer.id);
  }, [apply, select]);
  const recolorArrow = useCallback(async (id: string, color: string) => {
    const { state: st, meta: m } = latest.current;
    const layer = st.doc.layers.find((l) => l.id === id);
    if (!m || !layer || layer.type !== 'image' || !layer.arrow) return;
    const rec = await importImage(await arrowFile(color, 'Arrow', layer.arrow.shape), m.id);
    update(id, { assetId: rec.id, arrow: { ...layer.arrow, color } });
  }, [update]);
  const [found, setFound] = useState<[number, number, number, number][] | null>(null);
  // Everything that leaves Bopzi starts from one menu.
  const [asked, setAsked] = useState<{ what: 'set' | 'compare' | 'icon'; n: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const keysRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keysOpen) return;
    const away = (e: MouseEvent) => { if (!keysRef.current?.contains(e.target as Node)) setKeysOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setKeysOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [keysOpen]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);

  // ---- arrange for me
  type Arranged = { plan: Plan; pixels: ReturnType<typeof readPixels>; image: ImageBitmap; takes: Take[]; current: number; wording: string; layerIds: string[]; mode: 'suggest' | 'existing'; existing?: Layer[]; feedback: string; references: { name: string; sourceUrl: string; image: string }[]; referenceWarning?: string };
  const [arranging, setArranging] = useState(false);
  const [arrangeBrief, setArrangeBrief] = useState('');
  const [arrangeError, setArrangeError] = useState<string | null>(null);
  const [arrangeStatus, setArrangeStatus] = useState('Reading the scene');
  const [arrangeReference, setReference] = useState<{ name: string; image: string } | null>(null);
  const arrangeController = useRef<AbortController | null>(null);
  const cancelArrange = useCallback(() => arrangeController.current?.abort(), []);
  useEffect(() => () => arrangeController.current?.abort(), []);
  useEffect(() => { setReference(null); setArrangeBrief(''); setArrangedFull(null); arrangeController.current?.abort(); }, [meta?.id]);
  const setArrangeReference = useCallback(async (file: File | null) => {
    if (!file) { setReference(null); return; }
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 40 * 1024 * 1024) throw new Error('Choose a PNG, JPG or WebP under 40 MB.');
      setReference({ name: file.name, image: await smallCopy(file) });
    } catch (e) { notify(e instanceof Error ? e.message : 'That reference could not be read.', 'warn'); }
  }, [notify]);
  const [arrangedFull, setArrangedFull] = useState<Arranged | null>(null);
  useEffect(() => () => arrangedFull?.image.close(), [arrangedFull?.image]);
  const arrangedRef = useRef(arrangedFull);
  arrangedRef.current = arrangedFull;
  const arrowRecs = useRef(new Map<string, AssetRecord>());

  /** Puts one take on the canvas as layers, in place of whichever take was there. One step to undo. */
  const showTake = useCallback(async (a: Arranged, index: number, land = false) => {
    const m = latest.current.meta;
    const take = a.takes[index];
    if (!m || !take) return a;
    if (a.mode === 'existing') {
      const placements = [...(take.texts ?? []), ...(take.arrows ?? [])];
      apply(doc => applyExistingLayout(doc, placements));
      select(null);
      return { ...a, current: index };
    }
    // Fresh ids each time, so a take can be shown again after another one replaced it.
    const label = take.label ? { ...take.label, id: uid('l') } : null;
    const marks = take.marks.map((mark) => ({ ...mark, id: uid('l') }));
    let arrow: ImageLayer | null = null;
    if (take.arrow) {
      const key = `${m.id}:${take.arrow.shape}`;
      if (!arrowRecs.current.has(key)) arrowRecs.current.set(key, await importImage(await arrowFile('#F5311F', 'Arrow', take.arrow.shape), m.id));
      // The arrow stands on its own beside the prize, so it stays put when the label is moved.
      arrow = { ...makeImageLayer(arrowRecs.current.get(key)!, 'image'), name: 'Arrow', ...aimArrow(take.arrow.shape, take.arrow.start, take.arrow.end, take.arrow.mirror), arrow: { shape: take.arrow.shape, color: '#F5311F' } };
    }
    const added = [...(arrow ? [arrow] : []), ...(label ? [label] : []), ...marks];
    apply((doc) => added.reduce((d, layer) => insertLayer(d, layer), a.layerIds.reduce((d, id) => d.layers.find(l => l.id === id)?.locked ? d : removeLayer(d, id), doc)));
    select(null);
    // First time on the canvas they arrive in order: the words, then the arrow, then the marks.
    if (land) requestAnimationFrame(() => requestAnimationFrame(() => canvasRef.current?.animateIn(added.map(l => l.id))));
    return { ...a, current: index, layerIds: added.map((l) => l.id) };
  }, [apply, select]);

  const lay = useCallback(async (base: Omit<Arranged, 'takes'>) => {
    const built = buildTakes(base.plan, base.wording, base.pixels, base.existing);
    const takes = await Promise.all(built.map(async (t) => { const preview = await previewTake(base.image, t); return { ...t, preview }; }));
    return { ...base, takes };
  }, []);

  const arrange = useCallback(async (mode: 'suggest' | 'existing' = 'suggest') => {
    const { state: st, meta: m } = latest.current;
    if (!m || arrangeController.current) return;
    if (st.doc.size) { notify('Arranging works on thumbnails. On an icon, place callouts by hand.', 'warn'); return; }
    const images =[...st.doc.layers].reverse().filter((l): l is ImageLayer => l.type === 'image' && l.visible && l.name !== 'Arrow');
    const picture = images.find((l) => l.name === 'AI thumbnail') ?? images.find((l) => l.role === 'background');
    if (!picture) { notify('Generate a thumbnail or add a background first, so there is a picture to arrange on.', 'warn'); return; }
    const movable = st.doc.layers.filter(l => l.visible && !l.locked && (l.type === 'text' || (l.type === 'image' && l.arrow)));
    if (mode === 'existing' && !movable.length) { notify('Add an unpinned text or arrow layer first.', 'warn'); return; }
    const previous = arrangedRef.current;
    const replaced = mode === 'suggest' && previous?.mode === 'suggest' ? previous.layerIds.filter(id => !st.doc.layers.find(l => l.id === id)?.locked) : [];
    const omitted = mode === 'existing' ? movable.map(l => l.id) : replaced;
    const baseCanvas = canvasRef.current?.toCanvas(1024, omitted), composition = canvasRef.current?.toCanvas(720);
    if (!baseCanvas || !composition) { notify('The canvas is not ready yet.', 'warn'); return; }
    const controller = new AbortController(); arrangeController.current = controller;
    let image: ImageBitmap | null = null;
    let kept = false;
    setArranging(true);
    setArrangeError(null);
    setArrangeStatus('Reading the scene');
    try {
      const attachments = await getAttachments<{ data: string; name: string }>(m.id).catch(() => undefined);
      const reference = arrangeReference?.image ?? (attachments?.style?.data ? await smallCopy(await (await fetch(attachments.style.data)).blob()) : undefined);
      const input: ArrangeInput = { image: baseCanvas.toDataURL('image/jpeg', .88), composition: composition.toDataURL('image/jpeg', .85), scene: [m.prompt.genre, m.prompt.idea, m.prompt.hook, arrangeBrief].filter(Boolean).join('. '), mode, reference, referenceId: reference ? undefined : m.prompt.styleReferenceId, context: { hasComposition: true, hasReference: !!(reference || m.prompt.styleReferenceId), layers: st.doc.layers.filter(l => l.visible && (l.type === 'text' || (l.type === 'image' && l.arrow))).map(l => ({ ...describeLayer(l), movable: mode === 'existing' && !l.locked, replaced: replaced.includes(l.id) })) } };
      const plan = await requestPlan(input, controller.signal, setArrangeStatus);
      // Callouts left on the base are fixed obstacles, even when they are not explicitly pinned.
      const fixed = st.doc.layers.filter(l => l.visible && !omitted.includes(l.id) && (l.type === 'text' || (l.type === 'image' && l.arrow)));
      plan.protected.push(...fixed.map(l => { const r = layerRect(l); return [r.x / CANVAS_W, r.y / CANVAS_H, r.w / CANVAS_W, r.h / CANVAS_H] as [number, number, number, number]; }));
      image = await createImageBitmap(baseCanvas);
      const referencePool = [...(reference ? [{ name: arrangeReference?.name ?? 'Your inspiration', sourceUrl: '', image: reference }] : m.prompt.styleReferenceId ? [{ name: 'Selected inspiration', sourceUrl: '', image: '' }] : []), ...(input.references ?? [])];
      const selectedReferences = [...new Set(plan.layouts.map(l => l.referenceIndex).filter((i): i is number => i !== null))].flatMap(i => referencePool[i] ? [referencePool[i]] : []);
      const referenceWarning = (input.context.referenceSearch as { warning?: string })?.warning;
      setArrangeStatus('Building layout options');
      let laid = await lay({ plan, pixels: readPixels(image), image, wording: mode === 'existing' ? '' : plan.wordings[0]?.text ?? '', current: 0, layerIds: replaced, mode, existing: mode === 'existing' ? movable : undefined, feedback: '', references: selectedReferences, referenceWarning });
      setArrangeStatus('Reviewing small previews');
      const review = await reviewTakes(input, plan, laid.takes, controller.signal);
      if (!review) throw new Error('The visual review was incomplete. Try arranging again.');
      if (review.layouts.length === 3) {
        if (mode === 'suggest' && review.layouts.some(l => l.callouts === undefined)) throw new Error('The review did not return complete callout styles. Try again.');
        setArrangeStatus('Refining the layouts');
        laid = await lay({ ...laid, plan: { ...plan, layouts: review.layouts } });
      }
      const valid = laid.takes.map((t, i) => ({ i, penalty: t.issues.length + (t.readable ? 0 : 10), accepted: review.accepted[i] !== false }));
      laid.takes.forEach((take, i) => { take.usable = valid[i].accepted && valid[i].penalty === 0; });
      const recommended = valid.find(v => v.i === review.best && v.accepted && v.penalty === 0) ?? valid.find(v => v.accepted && v.penalty === 0);
      if (!recommended) { throw new Error('No layout passed the checks: ' + ([...new Set(laid.takes.flatMap(t => t.issues))].join('; ') || review.feedback || 'Try a different reference or shorter text.')); }
      if (controller.signal.aborted) throw new Error('Arrangement cancelled.');
      if (latest.current.meta?.id !== m.id || latest.current.state.doc !== st.doc) throw new Error('The canvas changed while arranging. Run it again to use your latest edits.');
      laid.references = [...new Set(laid.plan.layouts.map(l => l.referenceIndex).filter((i): i is number => i !== null))].flatMap(i => referencePool[i] ? [referencePool[i]] : []);
      laid.feedback = review.feedback || 'Reference hierarchy, placement and contrast reviewed.';
      setArrangedFull(await showTake(laid, recommended.i, true)); kept = true;
      setSuggested(null);
      notify(mode === 'existing' ? 'Your layers are arranged. Words, styles and pins preserved.' : 'Reviewed layouts are ready. Choose a different option below.');
    } catch (e) {
      if (controller.signal.aborted) notify('Arrangement cancelled.');
      else { const message = e instanceof Error ? e.message : 'The callouts could not be arranged.'; setArrangeError(message); notify(message, 'warn'); }
    } finally {
      setArranging(false);
      setFound(null);
      arrangeController.current = null;
      if (!kept) image?.close();
    }
  }, [lay, notify, showTake, arrangeReference, arrangeBrief]);

  const chooseTake = useCallback((index: number) => {
    const a = arrangedRef.current;
    if (a && !arrangeController.current && a.takes[index]?.usable !== false && index !== a.current) void showTake(a, index).then(setArrangedFull).catch(e => notify(e instanceof Error ? e.message : 'That layout could not be applied.', 'warn'));
  }, [showTake, notify]);
  const setWording = useCallback((text: string) => {
    const a = arrangedRef.current;
    if (!a || arrangeController.current || a.mode === 'existing' || text === a.wording) return;
    // New words change how big the label can be and where it fits, so all three takes are laid out again.
    void lay({ ...a, wording: text, feedback: 'Updated wording; layout and contrast checked.' }).then(laid => {
      if (arrangedRef.current !== a) return null;
      laid.takes.forEach(t => { t.usable = t.readable && t.issues.length === 0; });
      const index = laid.takes[a.current]?.usable ? a.current : laid.takes.findIndex(t => t.usable);
      if (index < 0) throw new Error('That wording does not fit readably. Try a shorter option.');
      return showTake(laid, index);
    }).then(a => { if (a) setArrangedFull(a); }).catch(e => notify(e instanceof Error ? e.message : 'That wording could not be placed.', 'warn'));
  }, [lay, showTake, notify]);
  const clearArranged = useCallback(() => { arrangedRef.current?.image.close(); setArrangedFull(null); }, []);
  const arranged = useMemo(() => arrangedFull && { takes: arrangedFull.takes.map(({ id, name, preview, readable, usable }) => ({ id, name, preview, readable, usable })), current: arrangedFull.current, wordings: arrangedFull.mode === 'existing' ? [] : arrangedFull.plan.wordings, wording: arrangedFull.wording, mode: arrangedFull.mode, feedback: arrangedFull.feedback, references: arrangedFull.references, referenceWarning: arrangedFull.referenceWarning }, [arrangedFull]);

  const addLight = useCallback(
    (preset: LightPreset) => {
      const layer = makeLightLayer(preset, canvasOf(latest.current.state.doc));
      apply((doc) => insertLayer(doc, layer));
      select(layer.id);
    },
    [apply, select],
  );

  const [editingText, setEditingText] = useState<string | null>(null);
  const editText = useCallback((id: string) => { select(id); setEditingText(id); }, [select]);
  const stopEditingText = useCallback(() => setEditingText(null), []);

  const exportPng = useCallback(async () => {
    const { meta: m, state: st } = latest.current;
    const icon = !!st.doc.size;
    const canvas = canvasRef.current?.toCanvas(icon ? ICON_EXPORT : CANVAS_W);
    if (!m || !canvas) return;
    setExporting(true);
    try {
      const blob = await canvasToBlob(canvas, 'image/png');
      downloadBlob(blob, `${slug(m.name)}-${canvas.width}x${canvas.height}.png`);
      patchMeta({ exportedAt: Date.now() });
      notify(icon ? `Exported a ${canvas.width} × ${canvas.height} icon.` : `Exported a 1920 × 1080 PNG (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
    } catch {
      notify('The export failed. Try again, or hide very large layers and retry.', 'warn');
    } finally {
      setExporting(false);
    }
  }, [notify, patchMeta]);

  /** Puts the picture on the clipboard, for pasting straight into a chat or a document. */
  const copyImage = useCallback(async () => {
    const canvas = canvasRef.current?.toCanvas(latest.current.state.doc.size ? ICON_EXPORT : CANVAS_W);
    if (!canvas) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToBlob(canvas, 'image/png') })]);
      patchMeta({ exportedAt: Date.now() });
      notify('Copied. Paste it into a chat or a document.');
    } catch {
      notify('This browser did not allow copying the image. Download it instead.', 'warn');
    }
  }, [notify, patchMeta]);

  // ---- copying a layer, here or into another project
  const copyLayer = useCallback((id: string) => {
    const { state: st, meta: m } = latest.current;
    const family = familyOf(id);
    const layers = st.doc.layers.filter((l) => family.includes(l.id));
    if (!m || !layers.length) return;
    try {
      localStorage.setItem(CLIP_KEY, JSON.stringify({ projectId: m.id, layers }));
      void navigator.clipboard.writeText(CLIP_MARK + layers[0].id).catch(() => {});
      notify(layers.length > 1 ? `${layers.length} layers copied. Paste them here or in another project.` : 'Layer copied. Paste it here or in another project.');
    } catch {
      notify('The layer could not be copied in this browser.', 'warn');
    }
  }, [notify, familyOf]);

  const pasteLayer = useCallback(async (id: string) => {
    const { state: st, meta: m } = latest.current;
    if (!m) return;
    try {
      const clip = JSON.parse(localStorage.getItem(CLIP_KEY) ?? 'null') as { projectId: string; layers?: Layer[] } | null;
      if (!clip?.layers?.length || clip.layers[0].id !== id) return;
      const here = clip.projectId === m.id;
      const copies: Layer[] = [];
      for (const layer of clip.layers) {
        let copy: Layer = { ...layer };
        if (copy.type === 'image') {
          // A generated image pasted in is an ordinary picture here, not another concept of this project.
          copy = { ...copy, conceptId: undefined, conceptName: undefined, name: copy.name === 'AI thumbnail' ? 'Pasted image' : copy.name };
          if (!here) {
            // The file belongs to the other project, so this one gets its own copy of it.
            const source = await getAsset(copy.assetId);
            if (!source) throw new Error('The image behind that layer is no longer in this browser.');
            copy = { ...copy, assetId: (await importImage(source.blob, m.id, source.name)).id };
          }
        }
        copies.push(copy);
      }
      // In another project they land in the middle; in the same one, just beside where they came from.
      const placed = placeCopies(copies, canvasOf(st.doc), (l) => ({ x: l.x, y: l.y, ...layerSize(l) }));
      addLayers(here ? placed.map((p, i) => ({ ...p, x: copies[i].x + 40, y: copies[i].y + 40 })) : placed);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That layer could not be pasted.', 'warn');
    }
  }, [addLayers, notify]);

  // Roblox tests 2 to 5 thumbnails against each other, and takes files up to 3 MB.
  const exportSet = useCallback(
    async (ids: string[]) => {
      const m = latest.current.meta;
      if (!m || !ids.length) return;
      const concepts = latest.current.state.doc.layers.filter((l) => l.type === 'image' && l.name === 'AI thumbnail');
      const before = new Map(concepts.map((c) => [c.id, c.visible]));
      const now = new Map(before);
      const show = (wanted: (id: string) => boolean) =>
        concepts.forEach((c) => {
          if (now.get(c.id) !== wanted(c.id)) update(c.id, { visible: wanted(c.id) }, 'concept-set');
          now.set(c.id, wanted(c.id));
        });
      const settle = () => new Promise<void>((done) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), 320));
      setExporting(true);
      select(null);
      let saved = 0;
      let asJpg = 0;
      try {
        for (const id of ids) {
          show((c) => c === id);
          await settle();
          const canvas = canvasRef.current?.toCanvas(CANVAS_W);
          if (!canvas) throw new Error('no canvas');
          let blob = await canvasToBlob(canvas, 'image/png');
          let ext = 'png';
          for (const quality of [0.92, 0.85, 0.75]) {
            if (blob.size <= SET_LIMIT) break;
            blob = await canvasToBlob(canvas, 'image/jpeg', quality);
            ext = 'jpg';
          }
          if (ext === 'jpg') asJpg++;
          downloadBlob(blob, `${slug(m.name)}-test-${++saved}.${ext}`);
          await new Promise((done) => setTimeout(done, 400));
        }
        patchMeta({ exportedAt: Date.now() });
        notify(`Saved ${saved} thumbnails for Roblox testing${asJpg ? `, ${asJpg} as JPG to stay under 3 MB` : ''}.`);
      } catch {
        notify(saved ? `Only ${saved} of ${ids.length} were saved. Try the rest again.` : 'The export failed. Try again.', 'warn');
      } finally {
        show((c) => !!before.get(c));
        setExporting(false);
      }
    },
    [notify, select, update, patchMeta],
  );

  // ---- keyboard and clipboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        save(true).then(saved => notify(saved ? 'Saved on this device.' : 'Could not save. Check browser storage and try again.', saved ? 'ok' : 'warn'));
        return;
      }
      if (isTyping(e.target)) return;
      const st = latest.current.state;
      const sel = st.doc.layers.find((l) => l.id === st.selectedId);
      if (mod && key === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && key === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Escape') {
        select(null);
      } else if (e.key === '?') {
        setKeysOpen((v) => !v);
      } else if (!mod && !e.altKey && !e.shiftKey && key in TOOL_KEYS) {
        pickTool(TOOL_KEYS[key]);
      } else if (!sel) {
        return;
      } else if (mod && key === 'c') {
        // Words highlighted on the page are what the person means to copy.
        if (!window.getSelection()?.toString()) { e.preventDefault(); copyLayer(sel.id); }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(sel.id);
      } else if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroup();
        else group();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate(sel.id);
      } else if (mod && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        reorder(sel.id, st.doc.layers.findIndex((l) => l.id === sel.id) + (e.key === ']' ? 1 : -1));
      } else if (e.key.startsWith('Arrow') && !sel.locked) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        // Everything selected moves together, as one step to undo.
        const family = familyOf(sel.id);
        apply((doc) => ({ ...doc, layers: doc.layers.map((l) => (family.includes(l.id) && !l.locked ? { ...l, x: l.x + dx, y: l.y + dy } : l)) }), `${sel.id}:nudge`);
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        addFiles(files, 'auto');
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text.startsWith(CLIP_MARK)) {
        e.preventDefault();
        void pasteLayer(text.slice(CLIP_MARK.length));
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, [addFiles, apply, copyLayer, duplicate, familyOf, group, notify, pasteLayer, pickTool, remove, reorder, save, select, ungroup]);

  const selected = useMemo(() => state.doc.layers.find((l) => l.id === state.selectedId) ?? null, [state.doc, state.selectedId]);

  const api = useMemo<StudioApi | null>(
    () =>
      meta && {
        projectId: meta.id,
        view,
        setView,
        takes,
        setTakes,
        previewOpen,
        setPreviewOpen,
        snapshot,
        projectName: meta.name,
        region,
        setRegion,
        marking,
        setMarking,
        exportSet,
        generation,
        setGeneration,
        demos,
        doc: state.doc,
        selected,
        lockOriginals: meta.lockOriginals,
        prompt: meta.prompt,
        fontsVersion,
        textInputRef,
        isProtected,
        select,
        update,
        setBackground: (background) => apply((doc) => ({ ...doc, background }), 'background'),
        remove,
        duplicate,
        reorder,
        addFiles,
        replaceImage,
        addGenerated,
        renameConcept: (id, name) => apply(doc => ({ ...doc, layers: doc.layers.map(l => l.type === 'image' && (l.conceptId ?? l.id) === id ? { ...l, conceptName: name } : l) })),
        showConcept: id => { select(null); apply(doc => activateConcept(doc, id)); },
        addText,
        addTexts,
        suggested,
        setSuggested,
        download: () => void exportPng(),
        asked,
        addArrow,
        recolorArrow,
        editingText,
        stopEditingText,
        found,
        arrange,
        arranging,
        arrangeStatus,
        arrangeBrief,
        arrangeError,
        setArrangeBrief,
        cancelArrange,
        arrangeReference,
        setArrangeReference,
        arranged,
        chooseTake,
        setWording,
        clearArranged,
        addLight,
        isIcon: !!state.doc.size,
        selectionIds,
        group,
        ungroup,
        align,
        addShape,
        addKit,
        saved,
        savePiece,
        addSaved,
        removeSaved,
        copyLayer,
        cutout,
        cutting: cut?.id ?? null,
        cutStatus: cut?.status ?? '',
        setLockOriginals: (lockOriginals) => patchMeta({ lockOriginals }),
        setPrompt: (patch) => patchMeta({ prompt: { ...meta.prompt, ...patch } }),
        editText,
        notify,
      },
    [meta, view, setView, takes, previewOpen, snapshot, region, marking, exportSet, generation, demos, state.doc, selected, fontsVersion, isProtected, select, update, apply, remove, duplicate, reorder, addFiles, addGenerated, replaceImage, addText, addTexts, suggested, exportPng, asked, addArrow, recolorArrow, editingText, stopEditingText, found, arrange, arranging, arrangeStatus, arrangeBrief, arrangeError, cancelArrange, arrangeReference, setArrangeReference, arranged, chooseTake, setWording, clearArranged, addLight, selectionIds, group, ungroup, align,addShape, addKit, saved, savePiece, addSaved, removeSaved, copyLayer, cutout, cut, patchMeta, editText, notify],
  );

  if (!meta || !api) return <StudioSplash label={new URLSearchParams(window.location.search).has('demo') ? 'Setting up the demo…' : undefined} />;

  // A concept is counted once, however many versions it has.
  const conceptCount = new Set(state.doc.layers.filter((l) => l.type === 'image' && l.name === 'AI thumbnail').map((l) => (l.type === 'image' && l.conceptId) || l.id)).size;
  const icon = !!state.doc.size;
  const originals = state.doc.layers.filter((l) => l.type === 'image' && l.original).length;
  const editing = view === 'edit';
  const stepZoom = (dir: 1 | -1) => setZoom(clamp(Math.round((scale + dir * 0.1) * 10) / 10, 0.1, 2));

  return (
    <StudioContext.Provider value={api}>
      <div className={`studio creator-studio v2 v3 view-${view} ${view !== 'edit' && !state.doc.layers.length ? 'is-fresh' : ''} text-[13px] text-ui-fg ${dark ? 'is-dark' : ''} ${editing && panel ? 'has-panel' : ''} ${tool || selected ? 'is-active' : ''}`}>
        {/* one toolbar: the project on the left, the tools in the middle, what leaves the app on the right */}
        <header className="studio-top">
          {/* With a project open this is the only bar in the window, so the way out lives here. */}
          <a href="/" className="studio-home" aria-label="Bopzi home" title="Home"><Mark size={26} bg="var(--studio-raise)" className="text-ivory" /></a>
          <div className="studio-name">
            <input
              aria-label="Project name"
              value={meta.name}
              maxLength={80}
              onChange={(e) => patchMeta({ name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && patchMeta({ name: icon ? 'Untitled icon' : 'Untitled thumbnail' })}
            />
            {/* Saving is quiet when it works, like a Mac document; it is only shown when it fails. Screen readers still hear it. */}
            <span className={saveState === 'error' ? 'save-feedback is-error' : 'sr-only'} role="status" aria-live="polite" aria-atomic="true">
              {saveState === 'error' && <i className={`size-1.5 flex-none rounded-full ${SAVE_DOT[saveState]}`} />}
              {SAVE_LABEL[saveState]}
              {saveState === 'error' && ' \u00b7 storage may be full or blocked'}
            </span>
          </div>
          {/* Out of Edit, the way between the modes; in Edit, the manual tools. */}
          {view === 'refine' && <>
            <button type="button" className="studio-quiet" aria-label="New idea" title="New idea" onClick={() => setView('create')}><Plus size={15} /><span>New idea</span></button>
            {conceptCount > 1 && <button type="button" className="studio-quiet" aria-label="All ideas" title="All ideas" onClick={() => setView('takes')}><LayoutGrid size={15} /><span>All ideas</span></button>}
          </>}
          <span className="flex-1" />
          {editing && <ToolSwitch tool={tool} onTool={pickTool} />}
          <span className="flex-1" />
          {editing && <span className="studio-history" role="group" aria-label="History">
            <IconBtn tip="Undo  (Ctrl Z)" disabled={state.past.length === 0} onClick={() => dispatch({ type: 'undo' })}>
              <Undo2 size={16} />
            </IconBtn>
            <IconBtn tip="Redo  (Ctrl Shift Z)" disabled={state.future.length === 0} onClick={() => dispatch({ type: 'redo' })}>
              <Redo2 size={16} />
            </IconBtn>
          </span>}
          <div className="dl studio-wide" ref={keysRef}>
            <IconBtn tip="More" aria-expanded={keysOpen} onClick={() => setKeysOpen((v) => !v)}>
              <MoreHorizontal size={16} />
            </IconBtn>
            {keysOpen && (
              <div className="dl-menu keys" role="dialog" aria-label="More">
                <a href="/projects" className="keys-theme"><FolderOpen size={15} /><b>Projects</b></a>
                <button type="button" className="keys-theme" onClick={toggleTheme}>
                  {dark ? <Sun size={15} /> : <Moon size={15} />}
                  <b>{dark ? 'Light appearance' : 'Dark appearance'}</b>
                </button>
                {/* Out of Edit the zoom row is put away, so the view lives here. */}
                {view === 'refine' && <>
                  <button type="button" className="keys-theme" onClick={() => { setZoom(zoom === 'fit' ? 1 : 'fit'); setKeysOpen(false); }}>
                    <Maximize size={15} /><b>{zoom === 'fit' ? 'Actual size' : 'Zoom to fit'}</b>
                  </button>
                  {!icon && <button type="button" className="keys-theme" aria-pressed={guides} disabled={state.doc.layers.length === 0} onClick={() => setGuides((v) => !v)}>
                    <Frame size={15} /><b>{guides ? 'Hide safe area' : 'Show safe area'}</b>
                  </button>}
                </>}
                <hr />
                <h3>Keyboard shortcuts</h3>
                <dl>
                  {SHORTCUTS.map(([keys, what]) => (
                    <div key={keys}>
                      <dt>{keys}</dt>
                      <dd>{what}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
          {/* The icon editor has no prompt bar, so it opens its Roblox view from the Download menu. */}
          {!icon && view !== 'create' && (
            <button type="button" className="studio-quiet" aria-label="Roblox view" title="See it next to real Roblox games" disabled={!state.doc.layers.some(l => l.visible) || exporting || (!!generation && generation.phase !== 'ready' && generation.phase !== 'failed')} onClick={() => setPreviewOpen(true)}>
              <Eye size={15} /><span>Roblox view</span>
            </button>
          )}
          {editing && (
            <IconBtn tip={panel ? 'Hide the panel' : 'Show the panel'} aria-pressed={panel} onClick={togglePanel}>
              <PanelRight size={16} />
            </IconBtn>
          )}
          {/* Edit opens the manual tools, the way Photos does; Done puts them away again. */}
          {(view === 'refine' || view === 'takes') && state.doc.layers.length > 0 && (
            <button type="button" className="ebtn studio-mode" onClick={() => { setTool(null); setView('edit'); }}><SlidersHorizontal size={14} />Edit</button>
          )}
          {editing && (
            <button type="button" className="ebtn studio-mode" onClick={() => { select(null); setTool(null); setView(state.doc.layers.length ? 'refine' : 'create'); }}><Check size={14} />Done</button>
          )}
          {view !== 'create' && <div className="dl" ref={menuRef}>
            <button type="button" className="ebtn go" disabled={state.doc.layers.length === 0 || exporting} aria-busy={exporting} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              {exporting ? <i className="spinner" /> : <Download size={15} />}
              <span className="studio-go-label">Download</span>
              <ChevronDown size={14} />
            </button>
            {menu && icon && (
              <div className="dl-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); void exportPng(); }}>
                  <b>This icon</b>
                  <small>Square, {ICON_EXPORT} {'×'} {ICON_EXPORT} PNG</small>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); void copyImage(); }}>
                  <b>Copy image</b>
                  <small>To paste into a chat or a document</small>
                </button>
                <hr />
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setPreviewOpen(true); }}>
                  <b>See it on Roblox</b>
                  <small>As an icon next to real games</small>
                </button>
              </div>
            )}
            {menu && !icon && (
              <div className="dl-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(false); void exportPng(); }}>
                  <b>This thumbnail</b>
                  <small>1920 {'\u00d7'} 1080 PNG</small>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); void copyImage(); }}>
                  <b>Copy image</b>
                  <small>To paste into a chat or a document</small>
                </button>
                <button type="button" role="menuitem" disabled={conceptCount < 2} onClick={() => { setMenu(false); setAsked({ what: 'set', n: Date.now() }); }}>
                  <b>Test set for Roblox</b>
                  <small>{conceptCount < 2 ? 'Needs two concepts' : '2 to 5 thumbnails to test against each other'}</small>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setAsked({ what: 'icon', n: Date.now() }); }}>
                  <b>Game icon</b>
                  <small>Square, 512 {'\u00d7'} 512</small>
                </button>
                {/* A plain link: the studio opens a project when it loads, so a new one needs a fresh page. */}
                <a role="menuitem" href="/studio?format=icon">
                  <b>Icon editor</b>
                  <small>A square canvas with the same tools</small>
                </a>
                <hr />
                <button type="button" role="menuitem" onClick={() => { setMenu(false); setPreviewOpen(true); }}>
                  <b>See it on Roblox</b>
                  <small>As a tile next to real games</small>
                </button>
                <button type="button" role="menuitem" disabled={conceptCount < 2} onClick={() => { setMenu(false); setAsked({ what: 'compare', n: Date.now() }); }}>
                  <b>Compare concepts</b>
                  <small>{conceptCount < 2 ? 'Needs two concepts' : 'Side by side'}</small>
                </button>
              </div>
            )}
          </div>}
          <AccountMenu />
        </header>

        {/* the canvas, and under it everything that acts on it */}
        <main aria-busy={!!generation && generation.phase !== 'ready' && generation.phase !== 'failed'} className="studio-main">
          {view === 'create' && <CreateIntro />}
          <div className="studio-canvas">
            <CanvasStage ref={canvasRef} zoom={zoom} guides={guides} onScale={setScale} onOpenPrompt={() => document.getElementById('composer-input')?.focus()} />
            <TakesBar />
            {view === 'takes' && <TakesGrid />}
          </div>
          {/* versions on the left, the view on the right: one quiet row between the canvas and the prompt */}
          <div className="workspace-bar">
            <div className="concept-dock" ref={setConceptDock} />
            <div className="studio-zoom" role="group" aria-label="Zoom">
              {!icon && (
                <IconBtn tip="Safe area" side="top" aria-pressed={guides} disabled={state.doc.layers.length === 0} onClick={() => setGuides((v) => !v)}>
                  <Frame size={13} />
                </IconBtn>
              )}
              <IconBtn tip="Zoom out" side="top" disabled={scale <= 0.1} onClick={() => stepZoom(-1)}>
                <Minus size={13} />
              </IconBtn>
              <button type="button" title="Actual size (100%)" onClick={() => setZoom(1)}>
                {Math.round(scale * 100)}%
              </button>
              <IconBtn tip="Zoom in" side="top" disabled={scale >= 2} onClick={() => stepZoom(1)}>
                <Plus size={13} />
              </IconBtn>
              <IconBtn tip="Fit to window" side="top" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
                <Maximize size={13} />
              </IconBtn>
            </div>
          </div>
          <Composer conceptDock={conceptDock} />
          {/* On a thumbnail the bar above owns this window. An icon project opens it from here. */}
          {icon && previewOpen && <RobloxPreview iconOnly name={meta.name} start="charts" icon={null} iconUrl={null} onIcon={idle} generating={false} error="" onGenerate={idle} onCancel={idle} games={iconGames} snapshot={snapshot} blocked="" notify={notify} onClose={() => setPreviewOpen(false)} />}
        </main>

        {editing && panel && <ToolPanel tool={tool} onClose={() => {
          setTool(null);
          document.querySelector<HTMLButtonElement>('.tool-switch button')?.focus();
        }} />}

        {toast && (
          <div key={toast.id} role="status" aria-live="polite" aria-atomic="true" className={`toast ${toast.tone === 'warn' ? 'is-warn' : ''}`}>
            {toast.tone === 'warn' ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
            <span>{toast.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
          </div>
        )}
      </div>
    </StudioContext.Provider>
  );
}
