'use client';
import { ArrowUp, BookImage, Check, ChevronDown, History, Columns2, Download, ImagePlus, Plus, SquareDashedMousePointer, RefreshCw, SlidersHorizontal, LayoutTemplate, Palette, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACCEPT_ATTR, loadAsset, useAsset } from '@/lib/assets';
import { deleteIcon, getAttachments, getIcon, putAttachments, putIcon } from '@/lib/db';
import { downloadBlob } from '@/lib/util';
import { autoArea } from '@/lib/thumbnail/prompt';
import type { ReferenceGame } from '@/lib/thumbnail/references';
import type { ImageLayer } from '@/lib/types';
import { useStudio, type Region, type TakeSlot } from './context';
import { TAKE_COUNT } from './Modes';
import { finish } from './finish';
import ReferenceBrowser from './ReferenceBrowser';
import RobloxPreview from './RobloxPreview';
import ConnectGuide from './ConnectGuide';
import VersionHistory from './VersionHistory';
import { usePresence } from './usePresence';
import { HELPER, findLink, type Link } from './imageRoute';
import ImproveScreenshot, { type ScreenshotAction } from './ImproveScreenshot';
import { polishScreenshot } from '@/lib/screenshot';

type Role = 'character' | 'object' | 'environment';
type Upload = { name: string; data: string; label: string; role: Role };
/** How many of the user's own images one thumbnail can use. */
const MAX_IMAGES = 3;
type Pop = 'add' | 'avatar' | 'render' | 'look' | 'style' | `ref-${number}` | null;

/** "blue_dragon-v2.png" becomes "Blue dragon v2": a name the description can use. */
const labelFrom = (file: string) => {
  const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return base ? base[0].toUpperCase() + base.slice(1) : 'My image';
};
const fileData = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('That image could not be read.'));
  reader.readAsDataURL(file);
});
/** Offered only while an inspiration is picked. */
const MATCH = { id: 'match', label: 'Match inspiration', hint: 'Its own technique' };
const STYLES = [
  { id: 'render', label: '3D render', hint: 'Blender-style GFX' },
  { id: 'gfx', label: 'Illustrated', hint: 'Crisp & graphic' },
  { id: 'vibrant', label: 'Vibrant', hint: 'Bold & colourful' },
  { id: 'horror', label: 'Horror', hint: 'Threat & atmosphere' },
];
const HOOKS = [
  { id: 'scene', label: 'Gameplay' },
  { id: 'near-miss', label: 'Near-miss' },
  { id: 'reward', label: 'Big reward' },
  { id: 'versus', label: 'Contrast' },
];
const EXPRESSIONS = [
  { id: 'auto', label: 'Fits the scene' },
  { id: 'struggle', label: 'Struggling, crying' },
  { id: 'shock', label: 'Shocked' },
  { id: 'excited', label: 'Excited' },
  { id: 'scared', label: 'Scared' },
  { id: 'keep', label: "Avatar's own face" },
];
const POSES = [
  { id: 'auto', label: 'Fits the scene' },
  { id: 'swing', label: 'Swinging a tool' },
  { id: 'run', label: 'Running' },
  { id: 'jump', label: 'Jumping' },
  { id: 'point', label: 'Pointing' },
  { id: 'none', label: 'No guide' },
];
/** Square generated icons keep the size the image model returns; export scales them down. */
const ICON_SIDE = 1024;
/** Generated images are ordinary layers with this name, which is what makes them the project's concepts. */
const CONCEPT = 'AI thumbnail';
const nameOf = (list: { id: string; label: string }[], id: string) => list.find(o => o.id === id)?.label;

/** Roblox runs its thumbnail test on 2 to 5 active thumbnails. */
const SET_MIN = 2;
const SET_MAX = 5;
const conceptLabel = (layer: ImageLayer, index: number) => layer.conceptName || `Idea ${index + 1}`;

function SetTile({ layer, index, on, disabled, onToggle }: { layer: ImageLayer; index: number; on: boolean; disabled: boolean; onToggle: () => void }) {
  const asset = useAsset(layer.assetId);
  return (
    <button type="button" className="compare-tile set-tile" role="checkbox" aria-checked={on} disabled={disabled} onClick={onToggle}>
      {asset && asset !== 'missing' && <img src={asset.url} alt={conceptLabel(layer, index)} draggable={false} />}
      <b>{on && <Check size={13} />}</b>
    </button>
  );
}

/** The returned image, cropped to fill the artwork: 1920 × 1080 for a thumbnail, square for an icon. */
async function toArtwork(base64: string, W = 1920, H = 1080) {
  const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, (W - bitmap.width * scale) / 2, (H - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale); bitmap.close();
  return canvas;
}
const pngOf = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare the thumbnail.')), 'image/png'));

/** Lays the changed image over the old one, but only inside the marked box, with a soft edge. */
async function keepOutside(previous: Blob, changed: HTMLCanvasElement, region: Region) {
  const W = changed.width, H = changed.height;
  const old = await createImageBitmap(previous);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;
  const oldScale = Math.max(W / old.width, H / old.height);
  ctx.drawImage(old, (W - old.width * oldScale) / 2, (H - old.height * oldScale) / 2, old.width * oldScale, old.height * oldScale); old.close();
  const feather = Math.round(Math.min(region.w * W, region.h * H) * 0.08) + 8;
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const m = mask.getContext('2d')!;
  // The shadow is what gives the box its soft edge; the box itself is drawn slightly inside the mark.
  m.shadowColor = '#000'; m.shadowBlur = feather; m.fillStyle = '#000';
  m.fillRect(region.x * W + feather / 2, region.y * H + feather / 2, Math.max(1, region.w * W - feather), Math.max(1, region.h * H - feather));
  m.shadowColor = 'transparent'; m.shadowBlur = 0;
  m.globalCompositeOperation = 'source-in';
  m.drawImage(changed, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(region.x * W, region.y * H, region.w * W, region.h * H); ctx.clip();
  ctx.drawImage(mask, 0, 0); ctx.restore();
  return out;
}

function CompareTile({ layer, index, onPick }: { layer: ImageLayer; index: number; onPick: () => void }) {
  const asset = useAsset(layer.assetId);
  return (
    <button type="button" className="compare-tile" onClick={onPick}>
      {asset && asset !== 'missing' && <img src={asset.url} alt={conceptLabel(layer, index)} draggable={false} />}
      <span>Use {conceptLabel(layer, index)}</span>
    </button>
  );
}

function ConceptThumb({ layer, index, versions, current, disabled, onPick, onRemove, onRename }: { layer: ImageLayer; index: number; versions: number; current: boolean; disabled: boolean; onPick: () => void; onRemove: () => void; onRename: (name: string) => void }) {
  const asset = useAsset(layer.assetId);
  const name = conceptLabel(layer, index);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <span className={`concept${versions > 1 ? ' is-stack' : ''}`}>
      <button type="button" aria-pressed={current} disabled={disabled} aria-label={`Show ${name}`} onClick={onPick}>
        {asset && asset !== 'missing' && <img src={asset.url} alt="" draggable={false} />}
      </button>
      {versions > 1 && <i aria-hidden>{versions}</i>}
      <input className="concept-name" aria-label={`Rename idea ${index + 1}`} title="Rename idea" disabled={disabled} maxLength={24} value={draft} onChange={e => setDraft(e.target.value)} onBlur={e => { const next = e.target.value.trim() || name; setDraft(next); if (next !== name) onRename(next); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { e.currentTarget.value = name; setDraft(name); e.currentTarget.blur(); } }} />
      <button type="button" className="concept-x" disabled={disabled} aria-label={versions > 1 ? `Delete this version of idea ${index + 1}` : `Delete concept ${index + 1}`} onClick={onRemove}><X size={11} /></button>
    </span>
  );
}

/**
 * The one place a thumbnail is asked for. What is attached shows as chips, the sentence goes in the middle,
 * and the same bar either makes a new concept or changes the one on the canvas.
 */
export default function Composer({ conceptDock }: { conceptDock: HTMLDivElement | null }) {
  const s = useStudio();
  const [connection, setConnection] = useState<Link | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const wasBusy = useRef(false);
  const [error, setError] = useState('');
  const [references, setReferences] = useState<Upload[]>([]);
  const [styleUpload, setStyleUpload] = useState<Upload | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ games: ReferenceGame[]; updatedAt: string }>({ games: [], updatedAt: '' });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [reloadCatalog, setReloadCatalog] = useState(0);
  const [avatarName, setAvatarName] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [change, setChange] = useState('');
  const [picked, setPicked] = useState<ReferenceGame | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [mode, setMode] = useState<'new' | 'change'>('new');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('start') === 'screenshot') setScreenshotOpen(true); }, []);
  const [screenshotIntent, setScreenshotIntent] = useState<{ id: string; action: ScreenshotAction; instruction: string } | null>(null);
  const history = usePresence(historyOpen ? true : null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const closeHistory = useCallback(() => { setHistoryOpen(false); historyTrigger.current?.focus(); }, []);
  const input = useRef<HTMLInputElement>(null);
  const styleInput = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);

  // Mirror the video composer: a slow, full-bar glow while working and one soft sweep on completion.
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setJustCompleted(false);
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setJustCompleted(true);
    const timer = setTimeout(() => setJustCompleted(false), 900);
    return () => clearTimeout(timer);
  }, [busy]);

  const check = useCallback(async () => {
    const link = await findLink();
    if (mounted.current) setConnection(link);
    return link;
  }, []);
  // The account menu asks for the guide from outside the studio with ?connect=1, and inside it with an event.
  useEffect(() => {
    const open = () => setGuideOpen(true);
    if (new URLSearchParams(window.location.search).get('connect') === '1') { open(); window.history.replaceState(null, '', '/studio'); }
    window.addEventListener('bopzi:connect', open);
    return () => window.removeEventListener('bopzi:connect', open);
  }, []);
  useEffect(() => { mounted.current = true; void check(); return () => { mounted.current = false; }; }, [check]);
  /** One request, carried out by whichever route is chosen. Resolves with the image as base64. */
  const ask = async (payload: object, signal: AbortSignal, onScene?: (scene: string) => void): Promise<string> => {
    const made = await askFull(payload, signal, onScene);
    // Only a new thumbnail brings suggestions; a change or an icon keeps whatever was offered before.
    return made.image;
  };
  /** `onScene` hears how the request was understood, a few seconds in, while the image is still being made. */
  const askFull = async (payload: object, signal: AbortSignal, onScene?: (scene: string) => void): Promise<{ image: string; notes?: string }> => {
    const post = (url: string, body: object, own: boolean) => fetch(url, { method: 'POST', headers: own ? { 'content-type': 'application/json', 'x-bopzi-local': '1' } : { 'content-type': 'application/json' }, signal, body: JSON.stringify(body) });
    const read = async (response: Response, what: string) => {
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error || what);
      // The answer comes a line at a time: news about the work first, the result last. An answer in one piece is one line.
      let result: { image: string; notes?: string } | null = null;
      const take = (line: string) => {
        if (!line.trim()) return;
        let value;
        try { value = JSON.parse(line); } catch { return; }
        if (value?.error) throw new Error(value.error);
        if (typeof value?.scene === 'string' && !value.image) onScene?.(value.scene); else result = value;
      };
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      for (;;) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) { take(pending.slice(0, end)); pending = pending.slice(end + 1); }
        if (done) break;
      }
      take(pending);
      if (!result) throw new Error(what);
      return result as { image: string; notes?: string };
    };
    if (connection?.via === 'helper') {
      // Bopzi works out the request; the helper on this computer makes the image with the visitor's own Codex.
      const job = await read(await post('/api/thumbnail/prepare', payload, true), 'The studio could not prepare the request. Try again in a moment.');
      const made = await read(await post(`${HELPER}/generate`, job, false).catch(e => { if (signal.aborted) throw e; throw new Error('The Bopzi helper stopped answering. Check that it is still running.'); }), 'The helper could not make the image.');
      if (!made.image) throw new Error('The helper returned no image.');
      return made;
    }
    const result = await read(await post('/api/thumbnail', payload, true), 'The studio could not reach Codex. Try again in a moment.');
    if (!result.image) throw new Error('Codex returned no image.');
    return result;
  };
  useEffect(() => {
    const abort = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    fetch('/api/thumbnail/references', { signal: abort.signal }).then(async r => {
      const body = await r.json().catch(() => null);
      if (!r.ok || !body || !Array.isArray(body.games)) throw new Error(body?.error || 'Could not load the library.');
      setCatalog(body);
    }).catch(e => { if (!abort.signal.aborted) setCatalogError(e.message || 'Could not load the library.'); }).finally(() => { if (!abort.signal.aborted) setCatalogLoading(false); });
    return () => abort.abort();
  }, [reloadCatalog]);
  // After a reload, a searched pick is only an id in the saved project: look the game up again.
  const savedId = s.prompt.styleReferenceId;
  useEffect(() => {
    if (!savedId || catalogLoading || catalog.games.some(g => g.id === savedId) || picked?.id === savedId) return;
    const abort = new AbortController();
    fetch('/api/thumbnail/references?id=' + savedId, { signal: abort.signal }).then(r => (r.ok ? r.json() : null)).then(body => { if (body?.game) setPicked(body.game); }).catch(() => {});
    return () => abort.abort();
  }, [savedId, catalogLoading, catalog.games, picked?.id]);
  useEffect(() => { try { setAvatarName(localStorage.getItem('bopzi:roblox-username') ?? ''); } catch { /* no storage */ } }, []);
  // A pop-up closes when the pointer goes anywhere else, or on Escape.
  useEffect(() => {
    if (!pop) return;
    const away = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) setPop(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPop(null); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [pop]);

  const inspired = !!(styleUpload || s.prompt.styleReferenceId);
  const styleOptions = inspired ? [MATCH, ...STYLES] : STYLES;
  // With an inspiration there is no rendering choice: a preset on top of it only ever fought it.
  const style = inspired ? 'match' : styleOptions.some(o => o.id === s.prompt.style) ? s.prompt.style : 'render';
  const borrowLayout = s.prompt.borrowLayout !== false;
  // Off unless asked for: lettering, icons and arrows belong in the studio, where they stay editable.
  const hook = s.prompt.hook ?? 'scene';
  const pose = POSES.some(o => o.id === s.prompt.pose) ? s.prompt.pose! : 'auto';
  const expression = EXPRESSIONS.some(o => o.id === s.prompt.expression) ? s.prompt.expression! : 'auto';
  // A pick can come from Roblox search, so it is not always in the curated list.
  const selectedGame = catalog.games.find(g => g.id === s.prompt.styleReferenceId) ?? (picked?.id === s.prompt.styleReferenceId ? picked : undefined);
  const inspiration = styleUpload ? { name: styleUpload.name, image: styleUpload.data } : selectedGame ? { name: selectedGame.name, image: selectedGame.imageUrl } : null;
  // Every generated image stays in the project as a layer; the visible one is the concept being worked on.
  const generated = s.doc.layers.filter((l): l is ImageLayer => l.type === 'image' && l.name === CONCEPT);
  // A change makes a new version of the same concept. Each concept shows one version: the one on the canvas, or the last one looked at.
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const groups: { id: string; versions: ImageLayer[]; shown: ImageLayer }[] = [];
  for (const l of generated) {
    const id = l.conceptId ?? l.id;
    const group = groups.find(g => g.id === id);
    if (group) group.versions.push(l); else groups.push({ id, versions: [l], shown: l });
  }
  for (const g of groups) g.shown = g.versions.find(v => v.visible) ?? g.versions.find(v => v.id === lastSeen[g.id]) ?? g.versions[g.versions.length - 1];
  const concepts = groups.map(g => g.shown);
  const current = [...concepts].reverse().find(l => l.visible) ?? null;
  const currentGroup = current ? groups.find(g => g.shown === current)! : null;
  const currentKey = currentGroup ? `${currentGroup.id}:${current!.id}` : '';
  useEffect(() => { if (!currentKey) return; const [group, id] = currentKey.split(':'); setLastSeen(v => (v[group] === id ? v : { ...v, [group]: id })); }, [currentKey]);
  const changing = !!current && mode === 'change';
  // A new result is most often followed by a tweak, so the bar switches to that.
  const currentId = current?.id;
  // Create asks for a new idea; everywhere else the bar changes the take on the canvas.
  useEffect(() => { setMode(s.view === 'create' ? 'new' : 'change'); }, [s.view]);
  // Create is one question, so the cursor is already in the box.
  useEffect(() => { if (s.view === 'create') field.current?.focus(); }, [s.view]);
  // A marked area belongs to one concept and to changing it.
  const { setRegion, setMarking } = s;
  useEffect(() => { setRegion(null); setMarking(false); }, [currentId, changing, setRegion, setMarking]);
  useEffect(() => {
    if (!screenshotIntent || currentId !== screenshotIntent.id || !changing) return;
    if (screenshotIntent.action === 'restyle') setChange(screenshotIntent.instruction);
    if (screenshotIntent.action === 'area') { setChange(''); setRegion(null); setMarking(true); }
    setScreenshotIntent(null);
  }, [screenshotIntent, currentId, changing, setRegion, setMarking]);

  // What is attached is saved with the project, so a reload does not empty the bar.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let alive = true;
    getAttachments<Upload>(s.projectId).then(saved => {
      if (!alive) return;
      if (saved) { setReferences((saved.references ?? []).slice(0, MAX_IMAGES)); setStyleUpload(saved.style ?? null); }
      setRestored(true);
    }).catch(() => { if (alive) setRestored(true); });
    return () => { alive = false; };
  }, [s.projectId]);
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => { putAttachments<Upload>({ projectId: s.projectId, references, style: styleUpload }).catch(() => { /* storage full or blocked: the images still work until the page closes */ }); }, 400);
    return () => clearTimeout(timer);
  }, [restored, references, styleUpload, s.projectId]);

  const [setOpen, setSetOpen] = useState(false);
  const [inSet, setInSet] = useState<string[]>([]);
  const [savingSet, setSavingSet] = useState(false);
  const openSet = () => { setInSet(concepts.slice(-SET_MAX).map(c => c.id)); setSetOpen(true); };
  const downloadSet = async () => { setSavingSet(true); try { await s.exportSet(concepts.filter(c => inSet.includes(c.id)).map(c => c.id)); } finally { if (mounted.current) { setSavingSet(false); setSetOpen(false); } } };
  useEffect(() => {
    if (!setOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !savingSet) setSetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, savingSet]);
  // An upload the description never names tends to be ignored by the model.
  const unmentioned = changing ? [] : references.map(r => r.label.trim()).filter(n => n.length > 1 && !s.prompt.idea.toLowerCase().includes(n.toLowerCase()));
  const full = references.length === MAX_IMAGES;
  const attached = references.length > 0 || !!inspiration;
  // The look as it stands when nothing in it has been touched.
  const lookChanged = expression !== 'auto' || pose !== 'auto' || hook !== 'scene' || !!s.prompt.game.trim() || (!inspired && style !== 'render' && s.view !== 'create');
  const lookSummary = `${nameOf(EXPRESSIONS, expression)} · ${nameOf(styleOptions, style)}`;
  const areaLabel = s.region ? 'Clear the marked area' : s.marking ? 'Drag on the thumbnail to mark an area' : 'Change only one area';
  const preparingEdit = useRef(false);

  /** Sends one request and puts the returned image on the canvas. `replaceId` makes it a refinement of that layer. */
  const asIcon = !!s.doc.size;
  const artwork = (image: string) => (asIcon ? toArtwork(image, ICON_SIDE, ICON_SIDE) : toArtwork(image));
  const run = async (payload: object, tint?: string, replaceId?: string, within?: { previous: Blob; region?: Region }, edit?: ImageLayer['edit'], polish = false) => {
    setBusy(true); setError(''); setPop(null);
    // An edit with no marked area hears the box it needs from the server, in place of the usual scene text.
    let area = within?.region;
    const startedAt = Date.now();
    const abort = new AbortController();
    const cancel = () => abort.abort();
    s.setGeneration({ phase: 'preparing', startedAt, cancel, tint });
    try {
      s.setGeneration({ phase: 'generating', startedAt, cancel, tint });
      const image = await ask(payload, abort.signal, (scene) => {
        if (within) { area ??= autoArea(scene) ?? undefined; return; }
        if (!abort.signal.aborted) s.setGeneration({ phase: 'generating', startedAt, cancel, tint, scene });
      });
      s.setGeneration({ phase: 'placing', startedAt, tint });
      const made = await artwork(image);
      const canvas = polish && !asIcon ? finish(made) : made;
      // With an area, everything outside it is taken from the image as it was, so it cannot drift.
      const final = await pngOf(within && area ? await keepOutside(within.previous, canvas, area) : canvas);
      // From here the image exists. If the browser cannot store it, hand it over as a file; never ask for it twice.
      const place = async (): Promise<boolean> => {
        try {
          await Promise.race([
            s.addGenerated(new File([final], `${CONCEPT}.png`, { type: 'image/png' }), replaceId, undefined, edit),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Saving the image in this browser took too long.')), 20000)),
          ]);
          s.setGeneration({ phase: 'ready', startedAt, tint });
          return true;
        } catch (e) {
          downloadBlob(final, 'bopzi-thumbnail.png');
          const why = e instanceof Error ? e.message : 'The image could not be saved in this browser.';
          const message = `${why} The image was downloaded so it is not lost.`;
          s.setGeneration({ phase: 'failed', startedAt, message, retry: () => { s.setGeneration({ phase: 'placing', startedAt, tint }); void place(); } });
          if (mounted.current) setError(message);
          return false;
        }
      };
      return await place();
    } catch (e) {
      if (abort.signal.aborted) { s.setGeneration(null); s.notify('Generation cancelled.'); return null; }
      else {
        const message = e instanceof Error ? e.message : 'Generation failed.';
        s.setGeneration({ phase: 'failed', startedAt, message, retry: () => void run(payload, tint, replaceId, within, edit, polish) });
        if (mounted.current) setError(message);
      }
      return false;
    }
    finally { if (mounted.current) setBusy(false); }
  };
  const brief = () => ({ scene: s.prompt.idea, title: s.prompt.game.trim(), style, hook, expression, pose, layout: inspired && borrowLayout, callouts: false, references: references.map(r => r.data), labels: references.map(r => ({ name: r.label.trim(), role: r.role })), styleReferenceId: s.prompt.styleReferenceId, styleReference: styleUpload?.data });
  /**
   * A new idea makes one thumbnail, shown in the Pick grid when it lands.
   * Stopping lets the take being made finish and skips the rest.
   */
  const generateTakes = async () => {
    const base = asIcon ? { ...brief(), title: '', icon: true } : brief();
    // One image waits where it will land, the same way a change does. Cancelling goes back to the question.
    if (TAKE_COUNT === 1) {
      const empty = !s.doc.layers.length;
      s.setTakes(null);
      s.setView('refine');
      if ((await run(base, undefined, undefined, undefined, undefined, true)) === null && empty) s.setView('create');
      return;
    }
    let stopped = false;
    const abort = new AbortController();
    const patch =(i: number, slot: Partial<TakeSlot>) => s.setTakes(t => t && { ...t, slots: t.slots.map((x, j) => (j === i ? { ...x, ...slot } : x)) });
    setBusy(true); setError(''); setPop(null);
    s.setTakes({ slots: Array.from({ length: TAKE_COUNT }, () => ({ status: 'waiting' as const })), running: true, stop: () => { stopped = true; s.setTakes(t => t && { ...t, stop: undefined }); } });
    s.setView('takes');
    try {
      for (let i = 0; i < TAKE_COUNT && !stopped && mounted.current; i++) {
        patch(i, { status: 'making', style: inspiration?.name });
        try {
          const image = await ask(base, abort.signal, scene => patch(i, { scene }));
          // An icon is flat and has to read at 150 pixels, so it skips the grain and vignette.
          const art = await artwork(image);
          const png = await pngOf(asIcon ? art : finish(art, i + 1));
          // From here the image exists. If the browser cannot store it, hand it over as a file rather than lose it.
          const id = await s.addGenerated(new File([png], `${CONCEPT}.png`, { type: 'image/png' })).catch((e: unknown) => {
            downloadBlob(png, `bopzi-image-${i + 1}.png`);
            throw new Error(`${e instanceof Error ? e.message : 'It could not be saved in this browser.'} It was downloaded instead.`);
          });
          patch(i, { status: 'ready', id });
        } catch (e) {
          patch(i, { status: 'failed', error: e instanceof Error ? e.message : 'This image could not be made.' });
          // A connection that is down will not come back for the next take either.
          if (!connection?.connected) break;
        }
      }
    } finally {
      // Takes that were never started are dropped, so the grid shows only what exists.
      s.setTakes(t => t && { slots: t.slots.filter(x => x.status !== 'waiting'), running: false });
      if (mounted.current) setBusy(false);
    }
  };
  // The game icon comes from the same brief, as a square image. It is kept beside the project, not on the canvas.
  const [icon, setIconState] = useState<Blob | null>(null);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconError, setIconError] = useState('');
  const [previewStart, setPreviewStart] = useState<'home' | 'charts'>('home');
  const iconAbort = useRef<AbortController | null>(null);
  useEffect(() => { let alive = true; getIcon(s.projectId).then(b => { if (alive) setIconState(b ?? null); }).catch(() => {}); return () => { alive = false; }; }, [s.projectId]);
  // Made in an effect so the address is never released while something still shows it.
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!icon) { setIconUrl(null); return; }
    const url = URL.createObjectURL(icon);
    setIconUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [icon]);
  const setIcon = (blob: Blob | null) => {
    setIconState(blob);
    (blob ? putIcon(s.projectId, blob) : deleteIcon(s.projectId)).catch(() => { if (blob) s.notify('The icon could not be saved in this browser. Download it from Preview to keep it.', 'warn'); });
  };
  // Runs here, not in the preview, so closing the preview does not cancel it.
  const generateIcon = async () => {
    if (iconBusy) return;
    setIconBusy(true); setIconError('');
    const abort = new AbortController();
    iconAbort.current = abort;
    try {
      const image = await ask({ ...brief(), title: '', icon: true }, abort.signal);
      setIcon(await (await fetch(`data:image/png;base64,${image}`)).blob());
      s.notify('Your game icon is ready.');
    } catch (e) {
      if (abort.signal.aborted) s.notify('Icon cancelled.');
      else { const message = e instanceof Error ? e.message : 'The icon could not be generated.'; if (mounted.current) setIconError(message); s.notify(message, 'warn'); }
    } finally { if (mounted.current) setIconBusy(false); }
  };
  const [iconOpen, setIconOpen] = useState(false);
  const openIcon = () => { setPreviewStart('charts'); s.setPreviewOpen(true); };
  const downloadIcon = async () => {
    if (!icon) return;
    const bitmap = await createImageBitmap(icon);
    const out = document.createElement('canvas'); out.width = 512; out.height = 512;
    out.getContext('2d')!.drawImage(bitmap, 0, 0, 512, 512); bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
    if (blob) { downloadBlob(blob, 'game-icon-512.png'); s.notify('Saved a 512 × 512 icon.'); }
  };
  useEffect(() => {
    if (!iconOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIconOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [iconOpen]);
  const iconBlocked = busy ? 'Wait for the current generation to finish.' : !connection?.connected ? (connection?.reason || 'The image connection is not ready.') : s.prompt.idea.trim().length < 12 ? 'Describe your game in the bar first, so the icon knows what to show.' : '';
  // Changing sends the current concept back with one instruction, so the composition is kept.
  const refine = async (text = change) => {
    if (!current || preparingEdit.current) return;
    preparingEdit.current = true;
    setBusy(true);
    setError('');
    const instruction = text.trim();
    const region = s.region ?? undefined;
    try {
      const asset = await loadAsset(current.assetId);
      if (!asset) throw new Error('The current thumbnail is no longer in this browser. Generate a new one.');
      const done = await run({ refine: { image: await fileData(asset.record.blob), instruction, region, icon: asIcon } }, undefined, current.id, { previous: asset.record.blob, region }, { instruction, parentId: current.id, area: !!region });
      if (done && mounted.current) { setChange(''); s.setRegion(null); field.current?.focus(); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'The edit could not be prepared.');
    } finally {
      preparingEdit.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const importScreenshot = async (file: File, action: ScreenshotAction, instruction: string) => {
    const polished = action === 'polish' ? await polishScreenshot(file) : null;
    const sourceId = await s.addGenerated(file, undefined, 'screenshot');
    if (polished) {
      await s.addGenerated(polished, sourceId);
      s.notify('Screenshot polished. Hold to compare shows the first version.');
    } else {
      setScreenshotIntent({ id: sourceId, action, instruction });
      s.notify(action === 'area' ? 'Mark an area on the screenshot, then describe the change.' : 'Review the restyling instruction, then press Apply.');
    }
    s.setView('refine');
  };
  const ready = !busy && !iconBusy && !!connection?.connected && (changing ? change.trim().length >= 4 : s.prompt.idea.trim().length >= 12);
  const submit = () => { if (ready) void (changing ? refine() : generateTakes()); };
  // The arrow on the home page already said go, so the idea does not wait for a second press.
  const autoStart = useRef(new URLSearchParams(window.location.search).get('auto') === '1');
  useEffect(() => {
    if (!autoStart.current) return;
    if (connection && !connection.connected) autoStart.current = false;
    if (!ready || s.view !== 'create') return;
    autoStart.current = false;
    window.history.replaceState(null, '', '/studio');
    void generateTakes();
  }, [ready, connection, s.view]);
  const [comparing, setComparing] = useState(false);
  useEffect(() => {
    if (!comparing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setComparing(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [comparing]);
  const showConcept = s.showConcept;
  const removeConcept = (id: string) => {
    // Deleting the one on show brings the previous one back, so the canvas is never left blank by surprise.
    // An earlier version of the same concept comes first; with none left, the previous concept.
    const versions = groups.find(g => g.versions.some(v => v.id === id))?.versions ?? [];
    const at = versions.findIndex(v => v.id === id);
    const next = id === current?.id ? versions[at - 1] ?? versions[at + 1] ?? [...concepts].reverse().find(c => c.id !== id) : null;
    s.remove(id);
    if (next) s.update(next.id, { visible: true });
  };

  // Roblox's own render of the user's avatar, added like any other upload so it can be named and removed.
  const addAvatar = async (who: { username: string } | { userId: number } = { username: avatarName }) => {
    if (references.length >= MAX_IMAGES) { setError(`A thumbnail can use up to ${MAX_IMAGES} of your images. Remove one to add another.`); return; }
    setError(''); setAvatarBusy(true);
    try {
      const res = await fetch('/api/thumbnail/avatar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(who) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) throw new Error(body?.error || 'That avatar could not be loaded. Try again in a moment.');
      setReferences(v => [...v, { name: `${body.name}-avatar.png`, data: body.data, label: 'My avatar', role: 'character' as Role }].slice(0, MAX_IMAGES));
      try { localStorage.setItem('bopzi:roblox-username', body.name); } catch { /* remembered only as a convenience */ }
      if (mounted.current) setPop(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'That avatar could not be loaded.'); }
    finally { if (mounted.current) setAvatarBusy(false); }
  };
  const upload = async (files: File[], asStyle: boolean) => {
    setError('');
    try {
      if (files.some(f => f.size > 8_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type))) throw new Error('Use PNG, JPG or WebP images under 8 MB each.');
      const taken = references.some(r => r.role === 'character');
      const next = await Promise.all(files.slice(0, asStyle ? 1 : MAX_IMAGES - references.length).map(async (f, i) => ({ name: f.name, data: await fileData(f), label: labelFrom(f.name), role: (asStyle || (!taken && i === 0) ? 'character' : 'object') as Role })));
      if (asStyle) { setStyleUpload(next[0] ?? null); s.setPrompt({ styleReferenceId: undefined, ...(next[0] ? { style: 'match' } : {}) }); }
      else setReferences(v => [...v, ...next].slice(0, MAX_IMAGES));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load that image.'); }
  };
  // ---- things pasted or dropped onto the bar
  /** A single pasted word that could be a Roblox username: offered, never assumed. */
  const [offer, setOffer] = useState<string | null>(null);
  // The offer stands while the box still holds exactly that word (it arrives a moment after the paste itself).
  useEffect(() => { if (offer && s.prompt.idea.trim() && s.prompt.idea.trim() !== offer) setOffer(null); }, [offer, s.prompt.idea]);
  const useGame = async (placeId: number) => {
    setError('');
    try {
      const body = await fetch('/api/thumbnail/references?place=' + placeId).then(r => r.json()).catch(() => null);
      if (!body?.game) throw new Error(body?.error || 'That game could not be found on Roblox.');
      const game = body.game as ReferenceGame;
      setPicked(game); setStyleUpload(null);
      s.setPrompt({ styleReferenceId: game.id, style: 'match' });
      s.notify(`Using the look of “${game.name}” as inspiration.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'That game could not be loaded.'); }
  };
  const attach = (files: File[]) => {
    if (full) setError(`A thumbnail can use up to ${MAX_IMAGES} of your images. Remove one to add another.`);
    else void upload(files, false);
  };
  /** Returns true when the pasted text was a Roblox link and has been dealt with. */
  const pastedLink = (text: string) => {
    const profile = /roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?users\/(\d+)/i.exec(text);
    const game = /roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/(\d+)/i.exec(text);
    if (profile && !changing) { void addAvatar({ userId: Number(profile[1]) }); return true; }
    if (game && !changing) { void useGame(Number(game[1])); return true; }
    return false;
  };
  const [dropping, setDropping] = useState(false);

  const clearInspiration = () => { setStyleUpload(null); s.setPrompt({ styleReferenceId: undefined }); setPop(null); };
  const toggle = (p: Exclude<Pop, null>) => setPop(v => (v === p ? null : p));
  const refIndex = pop?.startsWith('ref-') ? Number(pop.slice(4)) : -1;
  const ref = refIndex >= 0 ? references[refIndex] : undefined;

  // Two "main characters" is nearly always a mistake: the second one gets drawn as a person in the scene.
  const extraCharacter = changing ? -1 : references.findIndex((r, i) => r.role === 'character' && references.findIndex(x => x.role === 'character') !== i);
  // What the Download menu asks for is opened here, where those windows live.
  const askedN = s.asked?.n;
  useEffect(() => {
    const what = s.asked?.what;
    if (!what) return;
    if (what === 'set') openSet();
    else if (what === 'compare') setComparing(true);
    else if (icon && !iconBusy) setIconOpen(true);
    else openIcon();
  }, [askedN]);
  const notice = error
    ? { tone: 'error', text: error }
    : s.arranging
      ? { tone: 'info', text: `${s.arrangeStatus}…` }
    : offer
      ? { tone: 'info', text: `Is “${offer}” your Roblox username?`, action: { label: avatarBusy ? 'Loading' : 'Use this avatar', run: () => { const name = offer; s.setPrompt({ idea: '' }); void addAvatar({ username: name }); } } }
    : extraCharacter >= 0
      ? { tone: 'warn', text: `"${references[extraCharacter].label}" is set as a second main character, so it will be drawn as a person. If it is a creature or an item, change that.`, action: { label: 'It is a creature or item', run: () => setReferences(v => v.map((x, j) => (j === extraCharacter ? { ...x, role: 'object' as Role } : x))) } }
    : inspired && style !== 'match'
      ? { tone: 'warn', text: `Rendering is set to ${nameOf(styleOptions, style)}, which overrides the look of your inspiration.`, action: { label: 'Match inspiration', run: () => s.setPrompt({ style: 'match' }) } }
      : unmentioned.length
        ? { tone: 'warn', text: `Your description does not mention ${unmentioned.map(n => `"${n}"`).join(' or ')}. Use the name, or the image may be left out.` }
        : null;

  const avatarForm = <form className="pop-avatar" onSubmit={e => { e.preventDefault(); if (avatarName.trim()) void addAvatar(); }}>
    <UserRound size={17}/>
    <input className="finput" aria-label="Roblox username" placeholder="Roblox username" maxLength={21} autoComplete="off" spellCheck={false} disabled={busy || avatarBusy || full} value={avatarName} onChange={e => setAvatarName(e.target.value)}/>
    <button type="submit" disabled={busy || avatarBusy || full || avatarName.trim().length < 3}>{avatarBusy ? 'Loading' : 'Use my avatar'}</button>
  </form>;
  const hasArt = s.doc.layers.length > 0;
  const hasAvatar = references.some(r => r.label === 'My avatar');
  /** A format is its own project, so changing it starts one and carries the idea across. */
  const formatHref = (icon: boolean) => { const q = new URLSearchParams(); if (icon) q.set('format', 'icon'); if (s.prompt.idea.trim()) q.set('idea', s.prompt.idea); const text = q.toString(); return '/studio' + (text ? '?' + text : ''); };

  return <div className="composer-zone">
    {screenshotOpen && <ImproveScreenshot onImport={importScreenshot} onClose={() => setScreenshotOpen(false)} />}
    {/* The versions strip earns its space only once there is more than one take, or version, to move between. */}
    {conceptDock && (groups.length > 1 || (currentGroup?.versions.length ?? 0) > 1) && createPortal(<div className={`concept-dock-row${groups.length > 1 ? '' : ' is-single'}`}><div className="concepts" role="group" aria-label="Ideas">
      <span className="concepts-label">Ideas</span>
      {concepts.map((c, i) => <ConceptThumb key={groups[i].id} layer={c} index={i} versions={groups[i].versions.length} current={changing && c.id === current?.id} disabled={busy} onPick={() => { showConcept(c.id); s.setView('refine'); }} onRemove={() => removeConcept(c.id)} onRename={name => s.renameConcept(groups[i].id, name)}/>) }
      <button type="button" className="concept-new" aria-pressed={!changing} disabled={busy} onClick={() => s.setView('create')}><Plus size={15}/>New</button>
    </div><button ref={historyTrigger} type="button" className="workspace-history" aria-label="Version history" title="Version history" aria-expanded={historyOpen} aria-haspopup="dialog" disabled={!currentGroup || busy || s.arranging} onClick={() => setHistoryOpen(v => !v)}><History size={15}/><span>History</span>{currentGroup && currentGroup.versions.length > 1 && <small>{currentGroup.versions.length}</small>}</button></div>, conceptDock)}
    {history.rendered && currentGroup && current && <VersionHistory key={currentGroup.id} exiting={history.exiting} versions={currentGroup.versions} currentId={current.id} name={conceptLabel(current, concepts.indexOf(current))} disabled={busy || s.arranging} trigger={historyTrigger} onClose={closeHistory} onRestore={id => { if (busy || s.arranging) return; showConcept(id); setMode('change'); closeHistory(); s.notify(`Restored version ${currentGroup.versions.findIndex(v => v.id === id) + 1}.`); }}/>} 

    {iconOpen && icon && iconUrl && <div className="compare icon-view" role="dialog" aria-modal="true" aria-label="Your game icon" onClick={() => setIconOpen(false)}>
      <div className="icon-view-art" onClick={e => e.stopPropagation()}>
        <img src={iconUrl} alt="Your game icon" draggable={false}/>
        <figure><img src={iconUrl} alt="" draggable={false}/><figcaption>At the size Roblox shows it</figcaption></figure>
      </div>
      <p onClick={e => e.stopPropagation()}>
        <button type="button" className="set-go" onClick={() => void downloadIcon()}>Download 512 × 512</button>
        <button type="button" onClick={() => { setIconOpen(false); openIcon(); }}>See it on Roblox</button>
        <button type="button" disabled={!!iconBlocked} title={iconBlocked || undefined} onClick={() => { setIconOpen(false); void generateIcon(); }}>Generate another</button>
        <button type="button" onClick={() => { setIcon(null); setIconOpen(false); }}>Remove</button>
        <button type="button" onClick={() => setIconOpen(false)}>Close</button>
      </p>
    </div>}

    {setOpen && <div className="compare" role="dialog" aria-modal="true" aria-label="Download a test set" onClick={() => { if (!savingSet) setSetOpen(false); }}>
      <div className="set-head" onClick={e => e.stopPropagation()}>
        <h3>Download a set for Roblox to test</h3>
        <p>Roblox shows 2 to 5 active thumbnails to different players and gives the best one more views. Keep your current best one in the set.</p>
      </div>
      <div className="compare-grid set-grid" onClick={e => e.stopPropagation()}>
        {concepts.map((c, i) => { const on = inSet.includes(c.id); return <SetTile key={c.id} layer={c} index={i} on={on} disabled={savingSet || (!on && inSet.length >= SET_MAX)} onToggle={() => setInSet(v => on ? v.filter(x => x !== c.id) : [...v, c.id])}/>; })}
      </div>
      <p onClick={e => e.stopPropagation()}>
        <button type="button" className="set-go" disabled={savingSet || inSet.length < SET_MIN} onClick={() => void downloadSet()}>{savingSet ? 'Saving' : `Download ${inSet.length} thumbnail${inSet.length === 1 ? '' : 's'}`}</button>
        <span>{inSet.length < SET_MIN ? 'Pick at least 2.' : 'Each is 1920 x 1080 and under 3 MB, with your text and layers on top.'}</span>
        <button type="button" disabled={savingSet} onClick={() => setSetOpen(false)}>Close</button>
      </p>
    </div>}

    {comparing && <div className="compare" role="dialog" aria-modal="true" aria-label="Compare ideas" onClick={() => setComparing(false)}>
      <div className="compare-grid" data-count={Math.min(concepts.length, 4)} onClick={e => e.stopPropagation()}>
        {concepts.slice(-4).map(c => <CompareTile key={c.id} layer={c} index={concepts.indexOf(c)} onPick={() => { showConcept(c.id); setMode('change'); setComparing(false); }}/>)}
      </div>
      <p>Pick the one to keep working on{concepts.length > 4 ? ' (the latest four are shown)' : ''}. <button type="button" onClick={() => setComparing(false)}>Close</button></p>
    </div>}


    {notice && (!busy || notice.tone === 'error') && <p className={`composer-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}{'action' in notice && notice.action && <button type="button" disabled={busy} onClick={notice.action.run}>{notice.action.label}</button>}</p>}

    <div
      className={`composer${dropping ? ' is-dropping' : ''}${busy ? ' is-ai-thinking' : justCompleted ? ' is-ai-complete' : ''}`}
      aria-busy={busy}
      ref={bar}
      onDragOver={e => { if (!busy && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }}
      onDrop={e => {
        setDropping(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (busy || !files.length) return;
        e.preventDefault();
        attach(files);
      }}
    >
      {pop && <div className="composer-pop" role="dialog" aria-label={pop === 'add' ? 'Add to your thumbnail' : pop === 'avatar' ? 'Your Roblox avatar' : pop === 'render' ? 'Rendering' : pop === 'look' ? 'Look' : pop === 'style' ? 'Style inspiration' : 'Image details'}>
        {pop === 'add' && <>
          <button type="button" className="pop-row" disabled={busy || full} onClick={() => { input.current?.click(); setPop(null); }}><ImagePlus size={17}/><span>Upload an image<small>Character, creature or game screenshot</small></span></button>
          {avatarForm}
          <button type="button" className="pop-row" disabled={busy} onClick={() => { setLibraryOpen(true); setPop(null); }}><BookImage size={17}/><span>{inspiration ? 'Change inspiration' : 'Find inspiration'}<small>Borrow the look of a Roblox thumbnail</small></span></button>
          {full && <p className="pop-note">Three images is the limit. Remove one to add another.</p>}
        </>}
        {pop === 'avatar' && avatarForm}
        {pop === 'render' && <>
          <h4>Rendering</h4>
          <div className="pop-options">{STYLES.map(o => <button type="button" disabled={busy} key={o.id} aria-pressed={style === o.id} title={o.hint} onClick={() => { s.setPrompt({ style: o.id }); setPop(null); }}>{o.label}</button>)}</div>
        </>}
        {ref && <>
          <div className="pop-ref"><img src={ref.data} alt=""/>
            <div>
              <label>Name<input className="finput" disabled={busy} maxLength={40} placeholder="What is this?" value={ref.label} onChange={e => setReferences(v => v.map((x, j) => j === refIndex ? { ...x, label: e.target.value } : x))}/></label>
              <label>It is the<select className="finput" disabled={busy} value={ref.role} onChange={e => setReferences(v => v.map((x, j) => j === refIndex ? { ...x, role: e.target.value as Role } : x))}><option value="character">Main character</option><option value="object">Creature or object</option><option value="environment">Environment</option></select></label>
            </div>
          </div>
          <p className="pop-note">Use this name in your description.</p>
          <button type="button" className="pop-remove" disabled={busy} onClick={() => { setReferences(v => v.filter((_, j) => j !== refIndex)); setPop(null); }}>Remove image</button>
        </>}
        {pop === 'style' && inspiration && <>
          <div className="pop-ref"><img className="is-wide" src={inspiration.image} alt=""/><div><b>{inspiration.name}</b><small>Style only. Your game stays yours.</small></div></div>
          <label className="pop-check"><input type="checkbox" disabled={busy} checked={borrowLayout} onChange={e => s.setPrompt({ borrowLayout: e.target.checked })}/><span>Borrow its layout<small>Where things sit and how big they are.</small></span></label>
          <div className="pop-actions"><button type="button" disabled={busy} onClick={() => { setLibraryOpen(true); setPop(null); }}>Change</button><button type="button" className="pop-remove" disabled={busy} onClick={clearInspiration}>Remove</button></div>
        </>}
        {pop === 'look' && <>
          <h4>Expression</h4>
          <div className="pop-options">{EXPRESSIONS.map(o => <button type="button" disabled={busy} key={o.id} aria-pressed={expression === o.id} onClick={() => s.setPrompt({ expression: o.id })}>{o.label}</button>)}</div>
          <h4>Pose <span>guides the main character</span></h4>
          <div className="pop-options">{POSES.map(o => <button type="button" disabled={busy} key={o.id} aria-pressed={pose === o.id} onClick={() => s.setPrompt({ pose: o.id })}>{o.label}</button>)}</div>
          <h4>Rendering{inspired && <span>comes from your inspiration</span>}</h4>
          <div className="pop-options">{(inspired ? [MATCH] : styleOptions).map(o => <button type="button" disabled={busy} key={o.id} aria-pressed={style === o.id} title={o.hint} onClick={() => s.setPrompt({ style: o.id })}>{o.label}</button>)}</div>
          <h4>Visual hook</h4>
          <div className="pop-options">{HOOKS.map(h => <button type="button" disabled={busy} key={h.id} aria-pressed={hook === h.id} onClick={() => s.setPrompt({ hook: h.id })}>{h.label}</button>)}</div>
          <h4>Title <span>baked into the image</span></h4>
          <input className="finput" disabled={busy} maxLength={60} placeholder="Leave blank to add editable text later" value={s.prompt.game} onChange={e => s.setPrompt({ game: e.target.value })}/>
        </>}
      </div>}

      {changing && current?.edit && <div className="composer-last-edit" aria-hidden={busy} inert={busy}><span><Check size={12}/>Last edit: {current.edit.instruction}</span><button type="button" disabled={busy || s.arranging} onClick={() => setHistoryOpen(true)}>View history</button></div>}
      {/* What has been added, and the look once it is changed. With nothing to show, the row is not there at all. */}
      {!changing && (attached || lookChanged) && <div className="composer-chips" aria-hidden={busy} inert={busy}>
        {references.map((r, i) => <button key={r.name + i} type="button" className="chip" aria-expanded={pop === `ref-${i}`} disabled={busy} onClick={() => toggle(`ref-${i}`)}><img src={r.data} alt=""/>{r.label || 'Unnamed'}</button>)}
        {inspiration && <button type="button" className="chip" aria-expanded={pop === 'style'} disabled={busy} onClick={() => toggle('style')}><img className="is-wide" src={inspiration.image} alt=""/>Inspiration</button>}
        {lookChanged && <button type="button" className="chip is-look" aria-label={`Look: ${lookSummary}`} title={`Look: ${lookSummary}`} aria-expanded={pop === 'look'} disabled={busy} onClick={() => toggle('look')}><SlidersHorizontal size={13}/><span>{lookSummary}</span></button>}
      </div>}

      <div className="composer-working" role={busy ? 'status' : undefined} aria-live={busy ? 'polite' : undefined} aria-hidden={!busy} inert={!busy}>
        <span className="composer-working-orb" aria-hidden="true"/>
        <strong>{s.generation?.phase === 'preparing' ? 'Preparing your references…' : s.generation?.phase === 'placing' ? 'Placing it on the canvas…' : changing ? 'Applying your edit…' : `Creating your ${asIcon ? 'icon' : 'thumbnail'}…`}</strong>
      </div>

      <form className="composer-row" aria-hidden={busy} inert={busy} onSubmit={e => { e.preventDefault(); submit(); }}>
        {/* One plus for everything that can go with an idea: an avatar, images, inspiration. */}
        {!changing && <button type="button" className="composer-plus" aria-label="Add an avatar, image or inspiration" title="Add an avatar, image or inspiration" aria-expanded={pop === 'add'} disabled={busy} onClick={() => toggle('add')}><Plus size={18}/></button>}
        <textarea
          ref={field} id="composer-input" rows={1} disabled={busy}
          maxLength={changing ? 600 : 4000}
          aria-label={changing ? 'Describe an edit' : 'Describe your game'}
          placeholder={changing ? (s.region ? 'Describe the change inside the marked area…' : 'Describe a change…') : 'A player escaping a giant lava monster in an obby'}
          value={changing ? change : s.prompt.idea}
          onChange={e => { if (!e.target.value) setOffer(null); if (changing) setChange(e.target.value); else s.setPrompt({ idea: e.target.value }); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          onPaste={e => {
            // A pasted picture is attached like an uploaded one; pasted words go into the box as usual.
            const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
            if (files.length) { e.preventDefault(); attach(files); return; }
            // A Roblox profile link brings in that avatar, a game link that game's look. Neither belongs in the description.
            const text = e.clipboardData.getData('text/plain').trim();
            if (pastedLink(text)) { e.preventDefault(); return; }
            if (!changing && !s.prompt.idea.trim() && /^@?[A-Za-z0-9_]{3,20}$/.test(text)) setOffer(text);
          }}
        />
        {/* Limiting a change to one part of the picture belongs with the change itself, next to Apply. */}
        {changing && <button type="button" className="composer-area" aria-label={areaLabel} title={areaLabel} aria-pressed={s.marking || !!s.region} disabled={busy} onClick={() => { if (s.region || s.marking) { s.setRegion(null); s.setMarking(false); } else { setPop(null); s.select(null); s.setMarking(true); } }}>{s.region ? <X size={16}/> : <SquareDashedMousePointer size={16}/>}</button>}
        {/* What a first thumbnail usually needs stays in sight; the rest lives behind the plus. */}
        {s.view === 'create' && !changing && <div className="create-chips">
          {!hasAvatar && <button type="button" className="create-chip" aria-expanded={pop === 'avatar'} disabled={busy || full} onClick={() => toggle('avatar')}><UserRound size={15}/>My avatar</button>}
          <button type="button" className="create-chip" aria-label={`Rendering: ${nameOf(styleOptions, style)}`} aria-expanded={pop === 'render' || pop === 'style'} disabled={busy} onClick={() => toggle(inspired ? 'style' : 'render')}><Palette size={15}/>{nameOf(styleOptions, style)}<ChevronDown size={13}/></button>
          {!hasArt && <span className="create-format" role="group" aria-label="Format">
            <a href={formatHref(false)} aria-current={asIcon ? undefined : 'true'}>Thumbnail</a>
            <a href={formatHref(true)} aria-current={asIcon ? 'true' : undefined}>Icon</a>
          </span>}
        </div>}
        <button type="submit" className="composer-go" disabled={!ready} aria-label={changing ? 'Apply change' : asIcon ? 'Generate icon' : 'Generate thumbnail'} title={changing ? 'Apply  (Enter)' : 'Generate  (Enter)'}>
          {busy ? <i className="spinner"/> : <ArrowUp size={18}/>}
        </button>
      </form>
    </div>

    {s.view === 'create' && <div className="create-quick" role="group" aria-label="More ways to start"><button type="button" onClick={() => setScreenshotOpen(true)}><ImagePlus size={16}/> Use a screenshot</button><button type="button" onClick={() => s.setView('edit')}><LayoutTemplate size={16}/> Blank canvas</button><button type="button" onClick={() => setLibraryOpen(true)}><BookImage size={16}/> Inspiration</button></div>}

    {/* Said only when it needs the user: a connected plan is the normal case. */}
    {connection && !connection.connected && <p className="composer-status">
      <i/>{connection.reason || 'Connect Codex before generating.'}<button type="button" className="composer-setup" onClick={() => setGuideOpen(true)}>Connect Codex</button><button type="button" onClick={() => void check()} aria-label="Check the connection again"><RefreshCw size={12}/></button>
    </p>}

    {s.previewOpen && !asIcon && <RobloxPreview name={s.projectName} start={previewStart} icon={icon} iconUrl={iconUrl} onIcon={setIcon} generating={iconBusy} error={iconError} onGenerate={() => void generateIcon()} onCancel={() => iconAbort.current?.abort()} games={catalog.games} snapshot={s.snapshot} blocked={iconBlocked} notify={s.notify} onClose={() => { s.setPreviewOpen(false); setPreviewStart('home'); }}/>}
    {guideOpen && connection && <ConnectGuide link={connection} onCheck={check} onClose={() => setGuideOpen(false)}/>}
    {libraryOpen && <ReferenceBrowser games={catalog.games} loading={catalogLoading} error={catalogError} updatedAt={catalog.updatedAt} selectedId={s.prompt.styleReferenceId} onRetry={() => setReloadCatalog(v => v + 1)} onUploadStyle={() => { setLibraryOpen(false); styleInput.current?.click(); }} onClose={() => setLibraryOpen(false)} onPick={g => { setPicked(g); s.setPrompt({ styleReferenceId: g.id, style: 'match' }); setStyleUpload(null); setLibraryOpen(false); }}/>}
    <input ref={input} hidden type="file" accept={ACCEPT_ATTR} multiple onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void upload(files, false); }}/>
    <input ref={styleInput} hidden type="file" accept={ACCEPT_ATTR} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void upload(files, true); }}/>
  </div>;
}
