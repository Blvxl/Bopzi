'use client';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Info, ArrowRight, ArrowUp, ChevronLeft, Captions, Check, ChevronDown, Clapperboard, ClipboardPaste, Copy, Download, Film, FolderOpen, History, Loader2, Magnet, Maximize2, MessageSquare, MonitorPlay, Moon, Music2, Pause, Play, Plus, Redo2, Scissors, Search, SkipBack, SlidersHorizontal, Smartphone, Sparkles, Sticker, Sun, Trash2, Type, Undo2, Upload, Volume2, VolumeX, X, Zap, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_FONTS, fontOf, loadEditorFonts } from '@/lib/fonts';
import { IconBtn } from '@/studio/controls';

import WorkflowPanel from './WorkflowPanel';
import AiComposer from './AiComposer';
import { aiModelChoice } from './ModelPicker';
import { fixWord, knownIndex, nameSpeaker, understand, type Progress } from './understand';
import { footageText } from './footage-text';
import { cutRanges, cutWords, pauseRanges, timelineInsights, type CutWord, type Indexes, type Moment } from './insights';
import TranscriptPanel from './TranscriptPanel';
import MomentsPanel from './MomentsPanel';
import { AiTargetHints, aiTargets, landingSoundOn, playLandingTick, type AiTarget } from './AiTargets';
import MotionEditor from './MotionEditor';
import SpeedEditor from './SpeedEditor';
import { attachLayer, reconcileAttachments, reorderCompound, duplicateCompound, deleteSelection, moveFootage, type NamedCut } from './workflow';
import Preview, { type PreviewHandle } from './Preview';
import TimelineTracks from './Timeline';
import { face } from './faces';
import { CAPTION_PRESETS, FONT_KEYS, isMusic, TITLE_ANIMATIONS, captionAt, captionText, clipLength, dimensions, drawTitle, duration, EMPTY, lengthLabel, maxLength, MODES, newClip, newTitle, overlayBox, positions, splitClip, titleBox, titleOpacity, uid, validateTimeline, type AudioClip, type Caption, type CaptionStyle, type Clip, type Media, type Message, type Mode, type Overlay, type Revision, type SavedProject, type Timeline, type Title } from './model';
import { ICONS, iconSvg } from './icons';
import { renderLayerFrames, layerBoxes } from './layers';
import LayerPanel from './LayerPanel';
import TimingEditor from './TimingEditor';
import EasingPicker from './EasingPicker';
import EffectLibrary from './EffectLibrary';
import MediaLibrary from './MediaLibrary';
import EditReview, { type EditProposal } from './EditReview';
import RecipeLibrary from './RecipeLibrary';
import { timelineDifferences } from './ai-review';
import { gatherContext, renderFrame } from './ai-context';
import { applySteps, type Step } from './operations';
import { EMPTY_STYLE, loadStyleProfile, loadStyleReference, saveStyleProfile, saveStyleReference, type StyleProfile, type YouTubeStyleReference } from './ai-style';
import { GRADE_LIMITS, GRADE_PRESETS, NEUTRAL, isNeutral } from './grade';
import { PIP_LAYOUTS, newVideoOverlay, type PipLayout, type VideoOverlay } from './pip';
import { items, patchItem, duplicateItem, mergeAiEdit, removeMediaFromProject, visibleTimeline, type LayerSettings } from './editing';
import { RECIPES, applyRecipe } from './recipes';
import { EFFECT_LABELS, barFill, heldZoomAt, newEffect, type Effect, type HighlightEffect } from './motion';
import { pickObject, traceHighlight } from './track';
import { timelineBeats, type Beat } from './beats';
import { defaultSound } from './sfx';
import { TRANSITIONS, TRANSITION_SOUNDS, type Transition } from './transitions';
import { maskPicture } from './maskLook';
import { loadPresets, presetFrom, presetName, storePresets, type EffectPreset } from './presets';
import { invertMaskInBox } from './mask';
import { brushMask, type BrushPoint } from './mask-brush';
import { trackedPointSmooth } from './follow';
import { Paintbrush, Eraser } from 'lucide-react';
import { getMedia, getVideoProject, importMedia, releaseMedia, restoreMedia, saveMedia, saveVideoProject } from './storage';
import { addDropped, addPaths, diskUrl, loadOwnSounds, mediaPaths, pickPaths, previewStatus, revealExport } from './media-source';

/** Files one project can hold. Footage on disk costs the browser nothing, so this is only a sanity limit. */
const MEDIA_LIMIT = 200;
import { ownSounds, type OwnSound, type Sound } from './sounds';
import SoundLibrary, { SoundSelect, soundFile } from './SoundLibrary';
import { groupWords, makeCaptions } from './transcribe';

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}.${String(Math.floor(value % 1 * 100)).padStart(2, '0')}`;
const TEMPLATES = [{ name: 'Game launch', hint: 'The hook. The gameplay. The reveal.', text: 'PLAY SOMETHING NEW', color: '#ff7654' }, { name: 'Update reveal', hint: 'Give your next update a big entrance.', text: 'THE NEXT CHAPTER', color: '#f2b780' }, { name: 'Horror teaser', hint: 'A little suspense goes a long way.', text: 'YOU ARE NOT ALONE', color: '#ea7f91' }, { name: 'Gameplay showcase', hint: 'Let your best gameplay do the talking.', text: 'YOUR NEXT BIG MOMENT', color: '#7cd9bf' }];
const TITLE_COLORS = ['#ffffff', '#ff7654', '#e6a417', '#2fae7c'];
/** Everything the editor says or suggests changes with what the cut is for. */
const MODE_COPY: Record<Mode, { icon: typeof Film; hint: string; headline: string; body: string; placeholder: string; titles: string[] }> = {
  trailer: { icon: Clapperboard, hint: 'For your game page and Roblox Home', headline: 'Your game. Its big-screen moment.', body: 'Drop in gameplay and describe the trailer. Bopzi cuts it, you make it yours.', placeholder: 'Open on the boss fight, then show the core loop. Keep it under 30 seconds.', titles: ['YOUR NEXT BIG MOMENT', 'THE UPDATE IS HERE', 'SURVIVE THE NIGHT', 'PLAY NOW'] },
  short: { icon: Smartphone, hint: 'Vertical, fast, hooked from the first frame', headline: 'Your clip. Their next replay.', body: 'Drop in a recording and describe the Short. Bopzi makes it vertical, fast and hooked from frame one.', placeholder: 'Start on the 1 HP clutch, cut it to 20 seconds and add captions.', titles: ['WAIT FOR IT…', 'POV: 1 HP LEFT', 'THEY DIDN’T SEE ME', 'PART 2?'] },
  long: { icon: MonitorPlay, hint: 'YouTube videos, cut from your recordings', headline: 'Your session. Their full watch.', body: 'Drop in your recordings and describe the video. Bopzi builds the cut, chapter by chapter.', placeholder: 'Put the clips in order, tighten each one and add a title for every chapter.', titles: ['CHAPTER 1', 'THE PLAN', 'IT WENT WRONG', 'SUBSCRIBE FOR PART 2'] },
};
type Tool = 'workflow' | 'layers' | 'media' | 'audio' | 'text' | 'logos' | 'effects' | 'captions' | 'styles' | 'properties' | 'chat';
type CopyableTimelineItem = { kind: 'title'; item: Title } | { kind: 'caption'; item: Caption } | { kind: 'zoom'; item: Extract<Effect, { kind: 'zoom' }> };
/** The library's tabs, in CapCut's order: what you add first, then how it looks, then the helpers. */
// Keep the manual library focused on the things editors directly place and edit.
// Ask Bopzi for channel logos, branded packs, and workflow changes in the prompt.
const TOOLS: { id: Tool; label: string; icon: typeof Film }[] = [{ id: 'workflow', label: 'Editing tools', icon: SlidersHorizontal }, { id: 'layers', label: 'Layers', icon: Copy }, { id: 'media', label: 'Media', icon: Film }, { id: 'audio', label: 'Audio', icon: Music2 }, { id: 'text', label: 'Text', icon: Type }, { id: 'logos', label: 'Logos and images', icon: Sticker }, { id: 'effects', label: 'Effects', icon: Zap }, { id: 'captions', label: 'Captions', icon: Captions }, { id: 'styles', label: 'Roblox packs', icon: Clapperboard }, { id: 'properties', label: 'Properties', icon: SlidersHorizontal }, { id: 'chat', label: 'Chat', icon: MessageSquare }];
/** Items the AI added or changed, so the timeline can outline them until the edit is kept or undone. */
function changedIds(before: Timeline, after: Timeline) {
  return timelineDifferences(before, after).ids;
}
const INTRO: Message ={ role: 'assistant', text: 'Let’s make a video for your Roblox game. Add gameplay clips, then tell me what you want viewers to notice. I can put together a first cut, add captions and titles, and help shape it for a game page, YouTube, or Shorts.' };

export default function VideoEditor() {
  const router = useRouter();
  const [cuts, setCuts] = useState<NamedCut[]>([]), [quality, setQuality] = useState(1), [useProxies, setUseProxies] = useState(false), [loop, setLoop] = useState<[number, number] | null>(null);
  const [timeline, setTimeline] = useState<Timeline>(EMPTY), [assets, setAssets] = useState<Media[]>([]), [projectId, setProjectId] = useState('');
  const [messages, setMessages] = useState<Message[]>([INTRO]), [command, setCommand] = useState(''), [tool, setTool] = useState<Tool | null>(null);
  const [selected, setSelectedState] = useState<string | null>(null), [selectedIds, setSelectedIds] = useState<string[]>([]), [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [muted, setMuted] = useState(false);
  const setSelected = (id: string | null) => { setSelectedState(id); setSelectedIds(id ? [id] : []); };
  const [past, setPast] = useState<Revision[]>([]), [future, setFuture] = useState<Revision[]>([]), [zoom, setZoom] = useState(38), [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true), [saved, setSaved] = useState('Saved on this device'), [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [aiBusy, setAiBusy] = useState(false), [aiStage, setAiStage] = useState(''), [aiCompletion, setAiCompletion] = useState(0), [aiQuestion, setAiQuestion] = useState<{ question: string; choices: string[] } | null>(null), [exporting, setExporting] = useState(false), [captioning, setCaptioning] = useState('');
  /** While exporting: what is happening and how far along (0–1). After: the saved file, for "Show in folder". */
  const [packRoot, setPackRoot] = useState<string | null>(null);
  const [exportStage, setExportStage] =useState<{ label: string; share: number } | null>(null), [exported, setExported] = useState<{ file: string; name: string } | null>(null);
  const [previewGlowComplete, setPreviewGlowComplete] = useState(false);
  const [playerControlsPosition, setPlayerControlsPosition] = useState<{ x: number; y: number } | null>(null);
  const playerControlsDrag = useRef<{ pointerId: number; startX: number; startY: number; centerX: number; centerY: number; frame: HTMLElement } | null>(null);
  useEffect(() => {
    if (!aiCompletion) return;
    setPreviewGlowComplete(true);
    const timer = window.setTimeout(() => setPreviewGlowComplete(false), 950);
    return () => window.clearTimeout(timer);
  }, [aiCompletion]);
  const [historyOpen, setHistoryOpen] = useState(false), [dark, setDark] = useState(true);
  // The story strip is the default; every track is one click away.
  const [tracks, setTracks] = useState(false), [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // Snapping to cuts and edges, CapCut's magnet. On by default; holding Alt while dragging skips it once.
  const [magnet, setMagnet] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('bopzi-magnet') === 'off') setMagnet(false); } catch { /* storage blocked: stay on */ } }, []);
  // Sound effects on new effects (a whoosh on a punch, a boom on a shake...). On by default, remembered on this device.
  const [autoSfx, setAutoSfx] = useState(true);
  useEffect(() => { try { if (localStorage.getItem('bopzi-auto-sfx') === 'off') setAutoSfx(false); } catch { /* storage blocked: stay on */ } }, []);
  const toggleAutoSfx = (on: boolean) => { setAutoSfx(on); try { localStorage.setItem('bopzi-auto-sfx', on ? 'on' : 'off'); } catch { /* this session only */ } };
  const toggleMagnet = () => setMagnet(v => { try { localStorage.setItem('bopzi-magnet', v ? 'off' : 'on'); } catch { /* storage blocked: this session only */ } return !v; });
  /** The AI's last edit, so it can be kept or undone in one click. `before` is the cut before the request. */
  // Bopzi's answer when it made no change: shown in the same bar as an applied edit, cleared by the next edit.
  const [aiNote, setAiNote] = useState('');
  // Edit landing polish: items fading out on Undo, the result bar folding away, and where the AI aimed on screen.
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set()), [changeFolded, setChangeFolded] = useState(false), [aiAimed, setAiAimed] = useState<AiTarget[]>([]);
  const autoStop = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [change, setChange] = useState<{ summary: string; before: Timeline; ids: Set<string>; proposal?: EditProposal; check?: EditProposal['check'] } | null>(null);
  const [review, setReview] = useState<EditProposal | null>(null);
  const [aiStyle, setAiStyle] = useState<StyleProfile>(EMPTY_STYLE);
  const [aiStyleReference, setAiStyleReference] = useState<YouTubeStyleReference | null>(null);
  useEffect(() => { setAiStyle(loadStyleProfile(FONT_KEYS)); setAiStyleReference(loadStyleReference()); }, []);
  const [reviewModal, setReviewModal] = useState(false), [proposedPreview, setProposedPreview] = useState(true), [inspectorOpen, setInspectorOpen] = useState(false);
  const previewTimeline = review?.source === 'ai' && proposedPreview ? review.after : timeline, previewLength = duration(previewTimeline), modalReview = !!review && (review.source !== 'ai' || reviewModal);
  const canvasTimeline = useMemo(() => editing ? { ...previewTimeline, titles: previewTimeline.titles.filter(t => t.id !== editing.id), captions: previewTimeline.captions.filter(c => c.id !== editing.id) } : previewTimeline, [previewTimeline, editing]);
  useEffect(() => {
    setReviewModal(false); setProposedPreview(true);
    if (review?.source === 'ai') { setPlaying(false); const first = timelineDifferences(review.before, review.after).differences.find(d => d.afterStart !== undefined); if (first?.afterStart !== undefined) setTime(Math.min(duration(review.after), first.afterStart + .2)); }
  }, [review]);
  const [applyingProposal, setApplyingProposal] = useState(false);
  useEffect(() => { if (review) setNotice(''); }, [review]);
  const [layerQuery, setLayerQuery] = useState(''), [aiScope, setAiScope] = useState<'selected' | 'project'>('project');
  const timelineClipboard = useRef<CopyableTimelineItem[] | null>(null), [hasTimelineClipboard, setHasTimelineClipboard] = useState(false);
  const selectedLocked = !!(selected && timeline.layerSettings?.[selected]?.locked);
  const selectionLocked = selectedIds.some(id => timeline.layerSettings?.[id]?.locked);
  const copySelectionIds = selectedIds.length ? selectedIds : selected ? [selected] : [];
  const canCopyTimelineSelection = copySelectionIds.some(id => timeline.titles.some(item => item.id === id) || timeline.captions.some(item => item.id === id) || timeline.effects.some(item => item.id === id && item.kind === 'zoom'));
  const selectedLayer = items(timeline, assets).find(i => i.id === selected);
  const selectedCaption = timeline.captions.find(c => c.id === selected);

  // The AI prompt handles additions. Manual controls appear only for a selected layer.
  const openInspector = () => setInspectorOpen(true);
  const modal = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null), preview = useRef<PreviewHandle>(null), stage = useRef<HTMLDivElement>(null), chatEnd = useRef<HTMLDivElement>(null);
  const latest = useRef({ timeline, assets, messages, projectId }); latest.current = { timeline, assets, messages, projectId };
  const restored = useRef(false), aiAbort = useRef<AbortController | null>(null), exportAbort = useRef<AbortController | null>(null), operation = useRef(false);
  const [tracing, setTracing] = useState<{ id: string; share: number; note: string } | null>(null), traceAbort = useRef<AbortController | null>(null);
  const total = duration(timeline), max = maxLength(timeline.mode), modeText = MODE_COPY[timeline.mode], locked = loading || aiBusy || applyingProposal || exporting || !!busy || !!captioning;
  const clip = timeline.clips.find(c => c.id === selected), title = timeline.titles.find(t => t.id === selected), audio = timeline.audio.find(a => a.id === selected), overlay = timeline.overlays.find(o => o.id === selected), effect = timeline.effects.find(e => e.id === selected), videoOverlay = timeline.videoOverlays.find(o => o.id === selected);
  const [brushMode, setBrushMode] = useState<'paint' | 'erase' | null>(null);
  const [brushSize, setBrushSize] = useState(4), [brushAll, setBrushAll] = useState(false);
  useEffect(() => { setBrushMode(null); }, [selected]);
  const refiningHighlight = brushMode !== null && effect?.kind === 'highlight' ? effect : undefined;
  const libraryAssets = assets.filter(a => !timeline.removedMediaIds?.includes(a.id));
  // Each video is understood once, in the background: transcript and speakers, silences and laughs, shots and people.
  const [understanding, setUnderstanding] = useState<(Progress & { name: string }) | null>(null);
  // Keyed on which videos there are: a preview copy finishing changes an asset's URL, not what there is to understand.
  const videoIds = assets.filter(a => a.kind === 'video').map(a => a.id).join();
  useEffect(() => {
    let live = true;
    void (async () => {
      for (const asset of latest.current.assets.filter(a => a.kind === 'video')) {
        if (!live) return;
        if ((await knownIndex(asset))?.complete) continue;
        // The part of this video the cut uses (with a little either side) is listened to first. Right after an
        // upload the clip lands on the timeline a moment later, so give it that moment.
        await new Promise(r => setTimeout(r, 400)); if (!live) return;
        const used = latest.current.timeline.clips.filter(c => c.assetId === asset.id);
        const focus: [number, number] | undefined = used.length ? [Math.min(...used.map(c => c.in)) - 2, Math.max(...used.map(c => c.out)) + 2] : undefined;
        await understand(asset, p => { if (live) setUnderstanding({ ...p, name: asset.name }); }, aiModelChoice(), focus);
      }
      if (live) setUnderstanding(null);
    })();
    return () => { live = false; };
  }, [videoIds]);
  // What the analysis has found so far, per video, for the transcript, the timeline markers and the moments. It is
  // re-read whenever the analysis moves to another stage, so the panels fill in as results arrive.
  const [indexes, setIndexes] = useState<Indexes>({});
  useEffect(() => {
    let live = true;
    void Promise.all(assets.filter(a => a.kind === 'video').map(async a => [a.id, await knownIndex(a)] as const)).then(found => { if (live) setIndexes(Object.fromEntries(found.filter(([, i]) => i)) as Indexes); });
    return () => { live = false; };
  }, [assets, understanding?.stage]);
  const [view, setView] = useState<'timeline' | 'transcript' | 'moments'>('timeline');
  const words = useMemo(() => cutWords(timeline, indexes), [timeline, indexes]);
  const pauses = useMemo(() => pauseRanges(timeline, indexes), [timeline, indexes]);
  const insights = useMemo(() => timelineInsights(timeline, indexes), [timeline, indexes]);
  const cutText = (ranges: [number, number][], label: string) => { try { commit(cutRanges(latest.current.timeline, ranges, assets), label); setNotice(`${label}. Ctrl Z to undo.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not cut that.'); } };
  /**
   * A word the speech model misheard, fixed in the transcript: the fix is kept in the footage index (so the AI hears it
   * from now on), and a caption already showing that word at that moment is corrected too (one undo step).
   */
  const fixTranscriptWord = async (w: CutWord, text: string) => {
    const index = indexes[w.assetId]; if (!index) return;
    const next = await fixWord(index, w.src, text);
    setIndexes(all => ({ ...all, [w.assetId]: next }));
    const now = latest.current.timeline, bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    const wanted = w.text.split(/\s+/).map(bare).filter(Boolean);
    let fixed = 0;
    const captions = now.captions.map(c => {
      if (!wanted.length || c.start > w.end + .1 || c.start + c.duration < w.start - .1) return c;
      // The same word can appear twice in one caption ("closing in on in"): take the occurrence said closest to the
      // fixed word's moment, by its own timing when the caption has one, else by where it sits in the line.
      const tokens = c.text.split(' '), at = w.start - c.start;
      const hits = tokens.map((_, i) => i).filter(i => wanted.every((x, k) => bare(tokens[i + k] ?? '') === x));
      if (!hits.length) return c;
      const when = (i: number) => c.words?.length === tokens.length ? c.words[i].start : i / tokens.length * c.duration;
      const i = hits.reduce((best, h) => Math.abs(when(h) - at) < Math.abs(when(best) - at) ? h : best, hits[0]);
      // Keep the punctuation that was around the old word.
      const lead = tokens[i].match(/^[^\p{L}\p{N}']*/u)?.[0] ?? '', tail = tokens[i + wanted.length - 1].match(/[^\p{L}\p{N}']*$/u)?.[0] ?? '';
      const replaced = text.trim() ? [lead + text.trim() + tail] : [];
      const textNow = [...tokens.slice(0, i), ...replaced, ...tokens.slice(i + wanted.length)].join(' ').replace(/\s+/g, ' ').trim();
      fixed++;
      // Word timings only stay when the word count still matches, or the highlight would light the wrong word.
      return textNow.split(' ').length === tokens.length ? { ...c, text: textNow } : { ...c, text: textNow, words: undefined };
    });
    if (fixed) commit({ ...now, captions }, 'Fix caption word');
    setNotice(`Fixed "${w.text}" → "${text.trim() || '(removed)'}"${fixed ? ' in the transcript and captions' : ''}.`);
  };
  const renameSpeaker = async (assetId: string, speaker: number, name: string) => {
    const index = indexes[assetId]; if (!index || (index.speakerNames?.[speaker] ?? '') === name.trim()) return;
    const next = await nameSpeaker(index, speaker, name);
    setIndexes(all => ({ ...all, [assetId]: next }));
  };
  /** A suggested moment becomes the cut, or goes after it. Captions belonged to the old cut, so they are cleared. */
  const takeMoment = (m: Moment, append: boolean) => {
    const asset = assets.find(a => a.id === m.assetId); if (!asset) return;
    const clip = { ...newClip(asset), in: m.start, out: m.end }, now = latest.current.timeline;
    commit({ ...now, clips: append ? [...now.clips, clip] : [clip], captions: append ? now.captions : [] }, append ? 'Add suggested moment' : 'Use suggested moment');
    setView('timeline'); seek(append ? duration(now) : 0);
  };
  const pickedAsset = assets.find(a => a.id === (clip?.assetId ?? audio?.assetId ?? videoOverlay?.assetId));
  // The same light or dark choice as the thumbnail studio.
  useEffect(() => { try { setDark(localStorage.getItem('bopzi-studio-theme') !== 'light'); } catch {} void loadEditorFonts(); }, []);
  const toggleTheme = () => setDark(v => { try { localStorage.setItem('bopzi-studio-theme', v ? 'light' : 'dark'); } catch {} return !v; });
  const commit = useCallback((next: Timeline, label: string) => {
    const current = latest.current.timeline;
    next = reconcileAttachments(current, { ...mergeAiEdit(current, next, null), layerSettings: next.layerSettings, compounds: next.compounds, removedMediaIds: next.removedMediaIds });
    if (duration(next) > maxLength(next.mode) + .01) { setNotice('This change exceeds the video length limit. Shorten the cut first.'); return; }
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    setChange(null);
    setPast(p => [...p.slice(-39), { timeline: current, label, at: Date.now() }]); setFuture([]); setTimeline(next); latest.current.timeline = next; setPlaying(false);
  }, []);
  const undo = () => { setChange(null); setNotice(''); const last = past.at(-1); if (!last) return; setFuture(f => [{ timeline: latest.current.timeline, label: last.label, at: Date.now() }, ...f]); setTimeline(last.timeline); latest.current.timeline = last.timeline; setPast(past.slice(0, -1)); setPlaying(false); setAiNote('');
    // The AI reads recent chat; without this it would think an undone edit is still there.
    setMessages(m => [...m, { role: 'assistant', text: `Undone: ${last.label}. That change is no longer on the timeline.` }]); };
  const redo = () => { setChange(null); const next = future[0]; if (!next) return; setPast(p => [...p, { timeline, label: next.label, at: Date.now() }]); setTimeline(next.timeline); latest.current.timeline = next.timeline; setFuture(future.slice(1)); setPlaying(false); setAiNote('');
    setMessages(m => [...m, { role: 'assistant', text: `Redone: ${next.label}.` }]); };
  const loadProject = useCallback(async (id: string) => {
    setLoading(true); restored.current = false; setInspectorOpen(false); setPlaying(false); setReview(null); setChange(null);
    try {
      // The creator's own sounds first: a saved cut that uses them must not lose them in the check below.
      setPackRoot(await loadOwnSounds());
      const saved = await getVideoProject(id), records = await getMedia(id);
      const media = records.map(restoreMedia);
      const next = saved ? validateTimeline(saved.timeline, media) : { ...EMPTY };
      // Saved cuts go back through the same check, so older saves pick up today's fields.
      const revisions = (saved?.revisions ?? []).flatMap(r => { try { return [{ ...r, timeline: validateTimeline(r.timeline, media) }]; } catch { return []; } });
      for (const a of latest.current.assets) releaseMedia(a);
      setAssets(media); setTimeline(next); setMessages(saved?.messages ?? [INTRO]); setProjectId(id); latest.current = { timeline: next, assets: media, messages: saved?.messages ?? [INTRO], projectId: id };
      setCuts((saved?.cuts ?? []).flatMap(c => { try { return [{ ...c, timeline: validateTimeline(c.timeline, media) }]; } catch { return []; } })); setLoop(null);
      setTime(0); setSelected(null); setPast(revisions); setFuture([]); window.history.replaceState(null, '', `/video?p=${id}`);
      setSaved('Saved on this device'); restored.current = true;
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not reopen this project.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('p') || uid(); void loadProject(id); return () => { aiAbort.current?.abort(); exportAbort.current?.abort(); }; }, [loadProject]);
  useEffect(() => () => { for (const a of latest.current.assets) releaseMedia(a); }, []);
  // Preview copies of footage on disk are made by the server in the background; until one is ready the original plays.
  const pendingPreviews = assets.filter(a => a.disk && a.kind === 'video' && !a.disk.preview?.ready && !a.disk.preview?.error).map(a => a.id).join();
  useEffect(() => {
    if (!pendingPreviews) return;
    const timer = setInterval(async () => {
      for (const a of latest.current.assets.filter(a => a.disk && a.kind === 'video' && !a.disk.preview?.ready && !a.disk.preview?.error)) {
        const preview = await previewStatus(a.disk!).catch(() => null); if (!preview) continue;
        const current = latest.current.assets.find(m => m.id === a.id); if (!current?.disk) continue;
        if (preview.ready === current.disk.preview?.ready && preview.percent === current.disk.preview?.percent && !preview.error) continue;
        const disk = { ...current.disk, preview }, updated = { ...current, disk, url: diskUrl(disk) };
        const next = latest.current.assets.map(m => m.id === a.id ? updated : m); latest.current.assets = next; setAssets(next);
        if (preview.ready || preview.error) void saveMedia(latest.current.projectId, updated).catch(() => {});
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [pendingPreviews]);
  const makingPreviews = assets.filter(a => a.disk?.preview && !a.disk.preview.ready && !a.disk.preview.error);
  useEffect(() => {
    if (!projectId || !restored.current) return;
    setSaved('Saving…');
    const timer = setTimeout(() => { void saveVideoProject({ id: projectId, timeline, messages, revisions: past, cuts, updatedAt: Date.now() }).then(() => setSaved('Saved on this device'), () => setSaved('Could not save · storage full or blocked')); }, 500);
    return () => clearTimeout(timer);
  }, [timeline, messages, projectId, past, cuts]);
  useEffect(() => { if (time > previewLength) setTime(previewLength); }, [previewLength, time]);
  useEffect(() => { setLoop(range => range && (range[0] >= total - .034 ? null : [range[0], Math.min(total, range[1])])); }, [total]);
  useEffect(() => {
    if (!total) return;
    const viewport = document.querySelector<HTMLElement>('.ve-track-scroll');
    if (!viewport) return;
    const fit = () => {
      const visibleSeconds = Math.max(10, Math.ceil((total + 2) / 5) * 5);
      setZoom(Math.max(3, Math.min(90, Math.floor((viewport.clientWidth - 40) / visibleSeconds))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [total]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, aiBusy, tool]);
  useEffect(() => {
    if (!historyOpen) return;
    const before = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setHistoryOpen(false); }
      if (event.key === 'Tab') { const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select') ?? []); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); before?.focus(); };
  }, [historyOpen]);
  const seek = (t: number) => { clearTimeout(autoStop.current); setPlaying(false); setTime(t); };
  // After about 8 seconds the "Edit applied" bar folds to its Undo button, unless the check still has news.
  useEffect(() => {
    setChangeFolded(false);
    if (!change || change.check?.state === 'checking' || change.check?.problems.length) return;
    const timer = setTimeout(() => setChangeFolded(true), 8000);
    return () => clearTimeout(timer);
  }, [change]);
  // "/" jumps to the prompt; Esc stops an edit that is still being planned. Both work even while the editor is locked.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape' && aiAbort.current) { e.preventDefault(); aiAbort.current.abort(); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); document.getElementById('composer-input')?.focus(); }
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);
  const togglePlay = () => { clearTimeout(autoStop.current); if (!previewLength || locked) return; if (loop && (time < loop[0] || time >= loop[1])) setTime(loop[0]); else if (time >= previewLength) setTime(0); setPlaying(p => !p); };
  const removeSelected = () => {
    const ids = selectedIds.length ? selectedIds : selected ? [selected] : [];
    if (!ids.length || locked) return;
    try { commit(deleteSelection(timeline, ids), ids.length > 1 ? `Delete ${ids.length} selected items` : 'Delete selected block'); setSelected(null); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not delete selection.'); }
  };
  const split = () => { if (selectedLocked) return; const id = clip?.id ?? positions(timeline).find(p => time > p.start && time < p.end)?.clip.id; if (id && !timeline.layerSettings?.[id]?.locked) commit(splitClip(timeline, id, time), 'Split clip'); };
  useEffect(() => { const handler = (e: KeyboardEvent) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (locked || historyOpen || modalReview) return;
    if (review) { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } return; }
    const command = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (command && key === 'c' && copyTimelineSelection()) { e.preventDefault(); return; }
    if (command && key === 'v' && timelineClipboard.current?.length) { e.preventDefault(); pasteTimelineSelection(); return; }
    if (command && key === 'd' && selected) { e.preventDefault(); duplicate(); return; }
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (command && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else if (change?.proposal) undoAiEdit(); else undo(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedIds.length || selected)) { e.preventDefault(); removeSelected(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek(Math.max(0, Math.min(total, time + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30)))); }
    if (key === 's' && !command) split();
  }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); });
  /** Adds whatever `make` brings in to the project: saved first, then the first picture becomes the first clip. */
  const takeMedia = async (label: string, count: number, make: () => Promise<{ added: Media[]; errors: string[] }>) => {
    if (operation.current || locked) return; operation.current = true; setBusy(label); setNotice('');
    try {
      if (latest.current.assets.length + count > MEDIA_LIMIT) throw new Error(`Keep this project to ${MEDIA_LIMIT} media files.`);
      const { added, errors } = await make(), kept: Media[] = [];
      for (const media of added) { try { await saveMedia(latest.current.projectId, media); kept.push(media); } catch { releaseMedia(media); errors.push(`“${media.name}” could not be saved in this project.`); } }
      const all = [...latest.current.assets, ...kept]; latest.current.assets = all; setAssets(all);
      if (!latest.current.timeline.clips.length) { const first = kept.find(a => a.kind !== 'audio'); if (first) { const c = newClip(first); commit({ ...latest.current.timeline, clips: [c] }, 'Add first clip'); setSelected(c.id); } }
      if (errors.length) setNotice(errors.join(' '));
    } catch (e) { setNotice(e instanceof Error ? e.message : 'The media could not be added.'); }
    finally { operation.current = false; setBusy(''); }
  };
  /** Dropped or pasted files have no path: images stay in the browser; video and sound are streamed to the library. */
  const upload = (files: File[]) => takeMedia(files.some(f => !f.type.startsWith('image/')) ? 'Copying footage into Bopzi' : 'Importing media', files.length, async () => {
    const added: Media[] = [], errors: string[] = [];
    for (const f of files) { try { added.push(f.type.startsWith('image/') ? await importMedia(f) : await addDropped(f)); } catch (e) { errors.push(e instanceof Error ? e.message : `“${f.name}” could not be imported.`); } }
    return { added, errors };
  });
  /** Files by their paths: nothing is copied, Bopzi reads them where they are. */
  const addFromPaths = (paths: string[]) => takeMedia('Reading your footage', paths.length, () => addPaths(paths));
  /** The Windows file picker, opened by the local server; elsewhere the browser's own picker. */
  const chooseMedia = async () => {
    if (operation.current || locked) return;
    setBusy('Choose files in the window that opened');
    try { const paths = await pickPaths(); setBusy(''); if (paths.length) await addFromPaths(paths); }
    catch (e) { setBusy(''); if ((e as { unsupported?: boolean }).unsupported) file.current?.click(); else setNotice(e instanceof Error ? e.message : 'The file picker could not open.'); }
  };
  const placeAudio = (a: Media, at: number, effect = false) => {
    const current = latest.current.timeline, length = duration(current);
    if (current.audio.length >= 200) { setNotice('Keep this cut to 200 audio clips. Remove one before adding more.'); return; }
    // Sound effects are short hits, so they play louder and without the music fade.
    const item: AudioClip = { id: uid(), assetId: a.id, start: Math.min(at, Math.max(0, length - .1)), in: 0, duration: Math.min(a.duration, Math.max(1, length - at)), volume: effect ? .8 : .5, fade: !effect, role: effect ? 'sfx' : 'music' };
    commit({ ...current, removedMediaIds: current.removedMediaIds?.filter(id => id !== a.id), audio: [...current.audio, item] }, effect ? `Add ${a.name.replace(/\.\w+$/, '')}` : 'Add audio'); setSelected(item.id);
  };
  const addSound = async (sound: Sound) => {
    if (operation.current || locked) return; const at = time, name = `${sound.label}.mp3`;
    const existing = latest.current.assets.find(a => a.kind === 'audio' && a.name === name);
    if (existing) { placeAudio(existing, at, true); return; }
    operation.current = true; setBusy('Adding sound'); setNotice('');
    try {
      if (latest.current.assets.length >= MEDIA_LIMIT) throw new Error(`Keep this project to ${MEDIA_LIMIT} media files.`);
      const media = await importMedia(await soundFile(sound));
      try { await saveMedia(latest.current.projectId, media); } catch (error) { releaseMedia(media); throw error; }
      const all = [...latest.current.assets, media]; latest.current.assets = all; setAssets(all);
      placeAudio(media, at, true);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'This sound could not be added.'); }
    finally { operation.current = false; setBusy(''); }
  };
  /** A file from the creator's own pack as project media: read where it is, and only added once per project. */
  const packAsset = async (s: OwnSound): Promise<Media> => {
    const existing = latest.current.assets.find(a => a.disk?.path === s.path); if (existing) return existing;
    if (latest.current.assets.length >= MEDIA_LIMIT) throw new Error(`Keep this project to ${MEDIA_LIMIT} media files.`);
    const { added, errors } = await addPaths([s.path]);
    if (!added[0]) throw new Error(errors[0] ?? `“${s.label}” could not be added.`);
    const media = { ...added[0], name: s.label };
    await saveMedia(latest.current.projectId, media);
    const all = [...latest.current.assets, media]; latest.current.assets = all; setAssets(all);
    return media;
  };
  const addOwnSound = async (s: OwnSound) => {
    if (operation.current || locked) return; const at = time;
    operation.current = true; setBusy(s.kind === 'music' ? 'Adding music' : 'Adding sound'); setNotice('');
    try { placeAudio(await packAsset(s), at, s.kind === 'sfx'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'This sound could not be added.'); }
    finally { operation.current = false; setBusy(''); }
  };
  const addAsset = (id: string) => {
    const a = assets.find(a => a.id === id); if (!a || locked) return;
    if (a.kind === 'audio') placeAudio(a, time);
    else { const c = newClip(a); if (total + clipLength(c) > max) { setNotice(`Keep this cut under ${lengthLabel(timeline.mode)}. Trim a clip before adding more.`); return; } commit({ ...timeline, clips: [...timeline.clips, c] }, 'Add clip'); setSelected(c.id); setTime(total); }
  };
  // Titles added by hand pop in: the springy entrance reads better than a fade for short punchy words.
  const addText = (text: string) => { const t = { ...newTitle(Math.min(time, Math.max(0, total - 1)), text), animation: 'pop' as const }; commit({ ...timeline, titles: [...timeline.titles, t] }, 'Add title'); setSelected(t.id); setAiScope('selected'); openInspector(); };
  const updateClip = (patch: Partial<Clip>) => { if (clip) commit(patchItem(timeline, clip.id, patch), 'Adjust layer'); };
  const updateTitle = (patch: Partial<Title>) => { if (title) commit(patchItem(timeline, title.id, patch), 'Adjust layer'); };
  const updateAudio = (patch: Partial<AudioClip>) => { if (audio) commit(patchItem(timeline, audio.id, patch), 'Adjust layer'); };
  // ---- the music's beat: found on this computer, shown on the audio track, snapped to, and edited to.
  const [musicBeats, setMusicBeats] = useState<Beat[]>([]), [beatEvery, setBeatEvery] = useState<1 | 2 | 4>(4);
  useEffect(() => { let live = true; void timelineBeats(timeline, assets).then(b => { if (live) setMusicBeats(b); }); return () => { live = false; }; }, [timeline.audio, assets]); // eslint-disable-line react-hooks/exhaustive-deps
  /** A short zoom punch on the beat (every bar, every 2 beats or every beat), CapCut's beat sync. Beats that already
   * have a zoom on them are left alone, and the cut keeps to its 60-effect limit. */
  const syncToBeat = (every: 1 | 2 | 4) => {
    const picks = musicBeats.filter((b, i) => (every === 4 ? b.strong : i % every === 0) && b.time < total - .2);
    const free = picks.filter(b => !timeline.effects.some(e => e.kind === 'zoom' && Math.abs(e.start - b.time) < .15)).slice(0, Math.max(0, 60 - timeline.effects.length));
    if (!free.length) { setNotice(picks.length ? 'Those beats already have zooms on them.' : 'No beats fall inside the video yet.'); return; }
    const punches: Effect[] = free.map(b => ({ id: uid(), kind: 'zoom', start: Math.max(0, b.time - .04), duration: .32, amount: 1.12, x: .5, y: .5 }));
    commit({ ...timeline, effects: [...timeline.effects, ...punches] }, `Punch on ${punches.length} beats`);
    setNotice(`${punches.length} zoom punches on the beat${picks.length > free.length ? `, ${picks.length - free.length} beats skipped` : ''}.`);
  };
  /** Each cut moves onto the nearest beat within 0.4 s, by trimming or lengthening the clip before it, when its source allows. */
  const cutOnBeat = () => {
    let next = timeline, moved = 0;
    for (let i = 0; i < next.clips.length - 1; i++) {
      const spot = positions(next)[i], beat = musicBeats.reduce<Beat | null>((best, b) => Math.abs(b.time - spot.end) < Math.abs((best?.time ?? Infinity) - spot.end) ? b : best, null);
      if (!beat || Math.abs(beat.time - spot.end) > .4 || Math.abs(beat.time - spot.end) < .01) continue;
      const c = spot.clip, a = assets.find(m => m.id === c.assetId), out = c.out + (beat.time - spot.end) * c.speed, limit = a?.kind === 'image' ? 180 : a?.duration ?? c.out;
      if (out > limit || (out - c.in) / c.speed < .3) continue;
      next = patchItem(next, c.id, { out }); moved++;
    }
    if (!moved) { setNotice('The cuts are already on the beat, or too far from one to move.'); return; }
    commit(next, 'Move cuts onto the beat'); setNotice(`${moved} cut${moved > 1 ? 's' : ''} moved onto the beat.`);
  };
  /** A logo or one of the project's images on top of the video, from the playhead to the end of the cut. */
  const addOverlay = (picture: { icon: string } | { assetId: string }) => {
    const start = Math.min(time, Math.max(0, total - 1)), base = { id: uid(), style: 'color' as const, start, duration: Math.max(1, total - start), x: .9, y: .12, size: .12, animation: 'fade' as const };
    const item: Overlay = 'icon' in picture ? { ...base, source: 'icon', icon: picture.icon } : { ...base, source: 'image', assetId: picture.assetId, size: .2 };
    commit({ ...timeline, overlays: [...timeline.overlays, item] }, 'Add logo'); setSelected(item.id); setAiScope('selected'); openInspector();
  };
  /**
   * Copies an effect onto other clips, CapCut's "apply to all": each copy sits at the same moment within its clip as
   * the original does within its own, and never runs past its clip. A traced highlight is traced again on each clip,
   * since the object is somewhere else there.
   */
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  useEffect(() => setPresets(loadPresets()), []);
  const keepPresets = (next: EffectPreset[]) => { setPresets(next); storePresets(next); };
  const savePreset = (e: Effect) => { const name = presetName(e); keepPresets([{ id: uid(), name, effect: presetFrom(e) }, ...presets.filter(p => p.name !== name)].slice(0, 24)); setNotice(`Saved “${name}” to My presets in Effects.`); };
  /** A saved preset at the playhead, kept inside the cut. */
  const addPreset = (p: EffectPreset) => {
    const start = Math.min(time, Math.max(0, total - .5)), item = { ...p.effect, id: uid(), start, duration: Math.min(p.effect.duration, Math.max(.1, total - start)) } as Effect;
    if (item.kind === 'zoom' && item.mode === 'hold') item.rampDuration = Math.min(item.rampDuration ?? item.duration, item.duration);
    commit({ ...timeline, effects: [...timeline.effects, item] }, `Add ${p.name}`); setSelected(item.id); openInspector(); setTime(item.start);
  };
  const copyToClips = (source: Effect, clipIds: string[]) => {
    const spots = positions(timeline), home = spots.find(p => source.start >= p.start && source.start < p.end) ?? spots[0];
    if (!home) return;
    const offset = source.start - home.start, copies: Effect[] = [];
    for (const p of spots) {
      if (!clipIds.includes(p.clip.id) || p.clip.id === home.clip.id) continue;
      const start = p.start + Math.min(offset, Math.max(0, p.end - p.start - .1)), duration = Math.max(.1, Math.min(source.duration, p.end - start));
      const copy = { ...source, id: uid(), start, duration } as Effect;
      if (copy.kind === 'highlight') delete copy.mask;
      if (copy.kind === 'zoom' && copy.mode === 'hold') copy.rampDuration = Math.min(copy.rampDuration ?? duration, duration);
      copies.push(copy);
    }
    if (!copies.length) return;
    const next = { ...timeline, effects: [...timeline.effects, ...copies] };
    commit(next, `Add ${EFFECT_LABELS[source.kind].toLowerCase()} to ${copies.length} clip${copies.length > 1 ? 's' : ''}`);
    setCopyTargets([]); setNotice(`${EFFECT_LABELS[source.kind]} added to ${copies.length} more clip${copies.length > 1 ? 's' : ''}.`);
    const traced = copies.filter(c => c.kind === 'highlight').map(c => c.id);
    if (traced.length) void trace(traced, next);
  };
  /** An animation preset at the playhead, with settings that already look good. */
  const addEffect = (kind: Effect['kind']) => { const made = newEffect(kind, Math.min(time, Math.max(0, total - .5)), uid(), visibleTimeline(timeline).effects), hit = autoSfx ? defaultSound(made) : undefined, item: Effect = hit ? { ...made, sound: hit } : made; commit({ ...timeline, effects: [...timeline.effects, item] }, `Add ${EFFECT_LABELS[kind].toLowerCase()}`); setSelected(item.id); openInspector(); setTime(item.start);
    // A highlight is about one thing in the shot, so it opens straight into picking that thing.
    if (item.kind === 'highlight') setTimeout(() => startPicking(item), 0); };
  const updateEffect = (patch: Partial<Effect>) => { if (effect) commit(patchItem(timeline, effect.id, patch), 'Adjust effect'); };
  const updateOverlay = (patch: Partial<Overlay>) => { if (overlay) commit(patchItem(timeline, overlay.id, patch), 'Adjust layer'); };
  const updateVideoOverlay = (patch: Partial<VideoOverlay>) => { if (videoOverlay) commit(patchItem(timeline, videoOverlay.id, patch), 'Adjust video on top'); };
  /**
   * A video or image on top of the footage from the playhead: a facecam in the corner by default; on a Short with a
   * split layout it takes the bottom half and the gameplay moves to the top half.
   */
  const addVideoOverlay = (assetId: string, layout: PipLayout = 'pip') => {
    const a = assets.find(m => m.id === assetId); if (!a || locked || !total) return;
    if (timeline.videoOverlays.length >= 6) { setNotice('A cut can hold six videos on top. Remove one first.'); return; }
    const start = Math.min(time, Math.max(0, total - .5)), item = { ...newVideoOverlay(a, start, total - start, uid()), layout, ...(layout === 'pip' ? {} : { size: .5 }) };
    commit({ ...timeline, videoOverlays: [...timeline.videoOverlays, item] }, layout === 'pip' ? 'Add video on top' : 'Add split screen'); setSelected(item.id); setAiScope('selected'); openInspector();
  };
  const updateCaption = (id: string, patch: Partial<Caption>) => commit(patchItem(timeline, id, patch), 'Edit caption');
  const styleCaptions = (patch: Partial<CaptionStyle>) => commit({ ...timeline, captionStyle: { ...timeline.captionStyle, ...patch, ...(patch.preset === undefined ? { preset: undefined } : {}) } }, 'Style captions');
  const styleCaption = (id: string, patch: NonNullable<Caption['style']>) => commit({ ...timeline, captions: timeline.captions.map(c => c.id === id ? { ...c, style: { ...c.style, ...patch } } : c) }, 'Style caption');
  const applyTemplate = (index: number) => {
    const template = TEMPLATES[index]; const footage = libraryAssets.filter(a => a.kind !== 'audio');
    if (!footage.length) { setNotice('Add gameplay or images first, then choose a starting style.'); void chooseMedia(); return; }
    const clips = footage.slice(0, 8).map(a => ({ ...newClip(a), out: Math.min(a.kind === 'image' ? 3 : a.duration, index === 2 ? 3.5 : 2.5), fade: index === 2 }));
    const next = { ...timeline, clips, titles: [] as Title[] }; const length = duration(next);
    if (index !== 3) next.titles = [newTitle(.3, template.text), { ...newTitle(Math.max(0, length - 2.5), 'PLAY NOW'), duration: 2.5, y: .5 }];
    commit(next, `${template.name} starting cut`); setTime(0); setNotice(`${template.name} cut ready. Adjust the clips or describe your next edit.`);
  };
  const loadDemo = async () => {
    if (operation.current || locked) return; operation.current = true; setBusy('Opening demo');
    try {
      const files = await Promise.all(['/showcase/creators/treasure.webp', '/showcase/creators/underwater.webp', '/showcase/creators/football.webp'].map(async (url, i) => { const response = await fetch(url); if (!response.ok) throw new Error('Demo artwork could not be opened.'); return new File([await response.blob()], ['Treasure reveal.webp', 'Underwater world.webp', 'Winning moment.webp'][i], { type: 'image/webp' }); }));
      const media = await Promise.all(files.map(importMedia)); for (const a of media) await saveMedia(projectId, a);
      setAssets([...assets, ...media]); latest.current.assets = [...assets, ...media];
      commit({ ...timeline, name: 'The next big adventure', clips: media.map(a => ({ ...newClip(a), out: 4, fade: true })), titles: [newTitle(.4, 'FIND YOUR NEXT ADVENTURE'), { ...newTitle(4.3, 'DIVE INTO SOMETHING NEW'), color: '#b8ffdf' }, { ...newTitle(8.4, 'MAKE YOUR MOMENT'), y: .5 }], audio: [] }, 'Open image montage demo'); setTime(.8); setNotice('Image montage demo loaded. Upload gameplay to make your own trailer.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not open the demo.'); } finally { operation.current = false; setBusy(''); }
  };
  /** Listens to the cut on this computer and puts what is said on screen. */
  const autoCaptions = async (base?: Timeline) => {
    if (operation.current) return; operation.current = true; setPlaying(false); setCaptioning('Listening to your clips…');
    try {
      const from = base ?? latest.current.timeline;
      // When the footage analysis already heard every clip, captions come from its transcript: instant, and with the
      // words fixed by hand in the Transcript tab. Clips it cannot map (speed ramps, freezes, reversed) are listened to again.
      const heard = from.clips.filter(c => latest.current.assets.find(a => a.id === c.assetId)?.kind === 'video' && c.volume > 0);
      const known = heard.length > 0 && heard.every(c => indexes[c.assetId]?.done.includes('transcript') && c.freeze === undefined && !c.speedPoints?.length && !c.reverse);
      const fromTranscript = known ? cutWords(from, indexes).map(w => ({ start: w.start, end: w.end, text: w.text })) : [];
      const captions = fromTranscript.length ? groupWords(fromTranscript, from.mode) : await makeCaptions(from, latest.current.assets, p => setCaptioning(`Getting the speech model ready · ${Math.round(p)}%`));
      commit({ ...latest.current.timeline, captions }, 'Add captions'); setNotice(`${captions.length} captions added. Select a caption on the timeline to edit it.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Captions could not be made.'); }
    finally { operation.current = false; setCaptioning(''); }
  };
  /**
   * Picking the object before tracing, CapCut style: on the highlight's first frame, each click adds a part (or takes
   * one away in Remove mode, with Alt, or with a right click) and the cut-out is shown at once. The clicks are kept on
   * the highlight, so tracing starts from what was picked.
   */
  const [picking, setPicking] = useState<{ id: string; remove: boolean; busy: boolean; preview?: string } | null>(null);
  useEffect(() => { if (picking && picking.id !== selected) setPicking(null); }, [selected, picking]);
  /** `label` names the undo step; without one (just opening the picker) nothing changes until the first click. */
  const showPick = async (h: HighlightEffect, label?: string) => {
    setPicking(p => p && { ...p, busy: true });
    try {
      const found = await pickObject(latest.current.timeline, latest.current.assets, h);
      if (!found) { setNotice('Nothing was found there. Click right on the object.'); setPicking(p => p && { ...p, busy: false, preview: undefined }); return; }
      // The box follows what was picked, with a little room, so tracing searches the right place.
      const pad = .04, box = { x: found.box.x, y: found.box.y, w: Math.min(1, found.box.w + pad * 2), h: Math.min(1, found.box.h + pad * 2) };
      const now = latest.current.timeline;
      if (label && now.effects.some(e => e.id === h.id)) commit(patchItem(now, h.id, { points: h.points, ...box, mask: undefined }), label);
      setPicking(p => p && p.id === h.id ? { ...p, busy: false, preview: maskPicture(found.mask, found.w, found.h, h.color) } : p);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'The object could not be picked.'); setPicking(p => p && { ...p, busy: false }); }
  };
  const startPicking = (h: HighlightEffect) => { setBrushMode(null); setPlaying(false); setTime(h.start); setPicking({ id: h.id, remove: false, busy: false }); void showPick(h); };
  const clickPick = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = timeline.effects.find((x): x is HighlightEffect => x.id === picking?.id && x.kind === 'highlight');
    if (!picking || !h || picking.busy || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault(); e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    const label: 0 | 1 = picking.remove || e.altKey || e.button === 2 ? 0 : 1;
    void showPick({ ...h, points: [...(h.points ?? []), { x, y, label }].slice(-12) }, label ? 'Add to object' : 'Remove from object');
  };
  /** Follows each highlight's object through its moment and keeps the outline on it, one highlight at a time. */
  const trace = async (ids: string[], from?: Timeline) => {
    if (traceAbort.current) return;
    const abort = new AbortController(); traceAbort.current = abort;
    try {
      for (const id of ids) {
        const base = from ?? latest.current.timeline, target = base.effects.find((e): e is HighlightEffect => e.id === id && e.kind === 'highlight');
        if (!target) continue;
        setTracing({ id, share: 0, note: 'Getting the object finder ready…' });
        const mask = await traceHighlight(base, latest.current.assets, { ...target, mask: undefined }, (share, note) => setTracing({ id, share, note }), abort.signal);
        const now = latest.current.timeline;
        if (now.effects.some(e => e.id === id)) commit(patchItem(now, id, { mask }), 'Follow the object');
      }
    } catch (e) { if (!abort.signal.aborted) setNotice(e instanceof Error ? e.message : 'The object could not be traced.'); }
    finally { traceAbort.current = null; setTracing(null); }
  };
  /**
   * Asks the AI for an edit. It gets what the editor can measure here besides the timeline: frames sampled through each
   * video, loudness, the beat and what is said (transcribed first, without adding captions, when the request is about
   * speech). `fix` builds on a proposal the AI found problems in: the new proposal still starts from the real timeline.
   */
  const ask = async ({ fix, text }: { fix?: EditProposal; text?: string } = {}) => {
    const request = fix ? `${fix.instruction ?? fix.label}\n\nYour previous attempt had these problems; fix them and keep everything else: ${fix.check!.problems.map(p => `${p.time !== undefined ? `at ${p.time.toFixed(1)}s ` : ''}${p.problem}${p.fix ? ` (fix: ${p.fix})` : ''}`).join('; ')}`.slice(0, 1500) : (text ?? command).trim();
    if (!request || locked || operation.current || (review && !fix)) return;
    if (!assets.some(a => a.kind !== 'audio')) { setNotice('Upload gameplay or try the demo before asking for an edit.'); return; }
    // Plain new requests should stand on their own. Old turns are useful only when the user clearly refers back;
    // otherwise they can overpower a short new instruction such as “zoom in” and repeat a previous edit.
    const refersBack = /\b(that|this|it|those|them|same|again|also|instead|more|less|stronger|weaker|bigger|smaller|faster|slower|previous|earlier|last|undo|redo)\b/i.test(request);
    const before = fix?.before ?? timeline, base = fix?.after ?? timeline;
    // A fix builds on the proposal's switched-on steps, so the new proposal still lists every step from the real timeline.
    const earlier = fix?.steps?.filter((_, i) => fix.enabled?.[i] !== false) ?? [];
    if (fix) setReview(null); else if (text === undefined) setCommand('');
    setAiQuestion(null); setAiNote('');
    setAiBusy(true); setPlaying(false); setMessages(m => [...m, { role: 'user', text: fix ? 'Fix the problems found in the proposal.' : request }]);
    const abort = new AbortController(); aiAbort.current = abort; let captions = 'keep', next: Timeline | null = null;
    try {
      const canvas = preview.current?.canvas();
      let previewFrame: string | undefined;
      // Preserve more detail in the frame the model uses to judge composition and colour.
      // Cap at 1280px to avoid bloating the local edit request on high-resolution projects.
      if (canvas) { const frame = document.createElement('canvas'), width = Math.min(1280, canvas.width); frame.width = width; frame.height = Math.round(width * canvas.height / canvas.width); frame.getContext('2d')!.drawImage(canvas, 0, 0, frame.width, frame.height); previewFrame = frame.toDataURL('image/jpeg', .82); }
      setAiStage('Looking through your footage…');
      let speech: Timeline['captions'] = [];
      if (!base.captions.length && /\b(say|says|said|saying|talk|talks|talking|speak|speaks|speech|word|words|quote|mention|mentions|voice|commentary|filler|um+|uh+)\b|["“”]/i.test(request)) {
        setAiStage('Listening to what is said…');
        speech = await makeCaptions(base, assets).catch(() => []);
      }
      const seen = await gatherContext(libraryAssets, musicBeats, abort.signal);
      const footage = await footageText(libraryAssets, seen.legend);
      setAiStage('Bopzi is planning your edit…');
      const response = await fetch('/api/video/edit', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, signal: abort.signal, body: JSON.stringify({ instruction: request, timeline: base, selected, scope: selected && aiScope === 'selected' ? 'selected' : 'project', playhead: time, previewFrame, assets: libraryAssets.map(({ blob: _blob, url: _url, ...a }) => a), history: refersBack ? messages.slice(-6) : [], ...seen, footage, speech, styleProfile: aiStyle, styleReference: aiStyleReference && { title: aiStyleReference.title, author: aiStyleReference.author, thumbnail: aiStyleReference.thumbnail }, ...aiModelChoice() }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The edit could not be completed.');
      if (abort.signal.aborted) throw new Error('Edit cancelled.');
      if (result.question) {
        setMessages(m => [...m, { role: 'assistant', text: result.question }]);
        setAiQuestion({ question: result.question, choices: result.choices ?? [] }); return;
      }
      captions = result.captions;
      const steps: Step[] = [...earlier, ...(result.steps ?? [])], enabled = steps.map(() => true);
      // Music from the creator's own pack comes by its track id: bring the track into the project, then point there.
      for (const step of steps) {
        if (step.op !== 'add' || step.kind !== 'audio') continue;
        const track = ownSounds().find(s => s.kind === 'music' && s.id === step.item.assetId);
        if (track) { setAiStage(`Adding ${track.label}…`); step.item.assetId = (await packAsset(track)).id; }
      }
      const applied = applySteps(captions === 'remove' ? { ...before, captions: [] } : before, steps, latest.current.assets);
      next = { ...applied.timeline, removedMediaIds: timeline.removedMediaIds };
      setMessages(m => [...m, { role: 'assistant', text: 'Proposed: ' + result.summary }]);
      const proposal: EditProposal = { summary: result.summary, before, after: next, label: (fix?.label ?? request).slice(0, 60), source: 'ai', captions, instruction: fix?.instruction ?? request, steps, results: applied.results, enabled };
      // AI edits apply straight away; the "Edit applied" bar offers Undo instead of a review step.
      if (!timelineDifferences(base, next, assets).differences.length && captions !== 'make') { setMessages(m => [...m, { role: 'assistant', text: 'No change made: ' + result.summary }]); setAiNote(result.summary || 'Nothing needed to change.'); return; }
      // A fix replaces the attempt it fixes, so Undo still goes back to before the first one.
      if (abort.signal.aborted) throw new Error('Edit cancelled.');
      setAiStage('Preparing your preview…');
      if (await applyProposal(proposal, base, fix ? past.slice(0, -1) : past)) setAiCompletion(value => value + 1);
    } catch (e) {
      const cancelled = abort.signal.aborted;
      const message = cancelled ? 'Edit cancelled. Your cut is unchanged.' : e instanceof Error ? e.message : 'The edit could not be completed.';
      setMessages(m => [...m, { role: 'assistant', text: message }]);
      if (cancelled) setNotice(message);
      if (!fix && !cancelled) setCommand(request);
    }
    finally { setAiBusy(false); setAiStage(''); aiAbort.current = null; }
  };
  /** Switches one of the AI's steps off or on: the proposal is rebuilt from the original timeline with the rest. */
  const toggleStep = (index: number) => setReview(r => {
    if (!r?.steps || !r.enabled) return r;
    const enabled = r.enabled.map((on, i) => i === index ? !on : on);
    const applied = applySteps(r.captions === 'remove' ? { ...r.before, captions: [] } : r.before, r.steps, assets, { enabled });
    return { ...r, enabled, results: applied.results, after: { ...applied.timeline, removedMediaIds: r.before.removedMediaIds } };
  });
  /**
   * The AI looks at finished frames of its own proposal, where it changed things, and lists what it sees wrong (text
   * over the HUD, a box on the wrong thing). It never changes the proposal itself: "Fix" asks for a new, reviewed one.
   */
  const checkProposal = async (proposal: EditProposal) => {
    const length = duration(proposal.after), times: { time: number; what: string }[] = [];
    for (const d of timelineDifferences(proposal.before, proposal.after, assets).differences) {
      if (d.action === 'removed' || d.afterStart === undefined) continue;
      const t = Math.min(Math.max(0, length - .05), d.afterStart + .45);
      if (!times.some(x => Math.abs(x.time - t) < .3)) times.push({ time: t, what: `${d.action} ${d.kind}: ${d.label}` });
    }
    if (!times.length) return;
    const frames = times.sort((a, b) => a.time - b.time).slice(0, 6);
    const update = (check: EditProposal['check']) => setChange(c => c?.proposal === proposal ? { ...c, check } : c);
    update({ state: 'checking', frames: frames.length, problems: [] });
    try {
      await loadEditorFonts();
      const shots = []; for (const f of frames) shots.push({ ...f, image: await renderFrame(proposal.after, assets, f.time) });
      const response = await fetch('/api/video/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ instruction: proposal.instruction ?? proposal.label, summary: proposal.summary, frames: shots, ...aiModelChoice() }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      update({ state: 'done', frames: frames.length, problems: result.problems ?? [] });
    } catch { update({ state: 'failed', frames: frames.length, problems: [] }); }
  };
  const acceptReview = async () => { if (review) await applyProposal(review, review.before, past); };
  /** Applies a proposal as one Undo step; `expected` is the timeline it was built on. */
  const applyProposal = async (proposal: EditProposal, expected: Timeline, historyBefore: typeof past): Promise<boolean> => {
    if (JSON.stringify(latest.current.timeline) !== JSON.stringify(expected)) { setNotice('The edit changed while this proposal was being prepared. Discard it and try again.'); return false; }
    setApplyingProposal(true); setNotice('');
    commit(proposal.after, proposal.label); setReview(null); setPlaying(false); setSelected(null);
    try {
      if (proposal.captions === 'make') await autoCaptions(proposal.after);
      const fresh = proposal.after.effects.filter(e => e.kind === 'highlight' && !e.mask && !proposal.before.effects.some(o => o.id === e.id && !(o.kind === 'highlight' && o.mask))).map(e => e.id);
      if (fresh.length && proposal.source !== 'cut') await trace(fresh, latest.current.timeline);
      // Follow-up captions/traces belong to this same accepted proposal. Keep
      // the whole transaction as one Undo step, with no intervening manual edits.
      setPast([...historyBefore.slice(-39), { timeline: proposal.before, label: proposal.label, at: Date.now() }]); setFuture([]);
      setChange({ summary: proposal.summary, before: proposal.before, ids: changedIds(proposal.before, latest.current.timeline), proposal });
      setMessages(m => [...m, { role: 'assistant', text: 'Applied: ' + proposal.summary }]);
      if (proposal.source === 'ai') showLanding(proposal);
    } finally { setApplyingProposal(false); }
    if (proposal.source === 'ai') void checkProposal(proposal);
    return true;
  };
  /** Shows where an edit landed: plays two seconds from its first change, outlines what it aimed at, optional tick. */
  const showLanding = (proposal: EditProposal) => {
    const now = latest.current.timeline, ids = changedIds(proposal.before, now);
    const first = items(now, assets).filter(i => ids.has(i.id)).sort((a, b) => a.start - b.start)[0];
    if (first) { setTime(Math.max(0, first.start - .3)); setPlaying(true); clearTimeout(autoStop.current); autoStop.current = setTimeout(() => setPlaying(false), 2300); }
    const aimed = aiTargets(proposal.before, now); setAiAimed(aimed);
    if (aimed.length) setTimeout(() => setAiAimed(a => a === aimed ? [] : a), 2600);
    if (landingSoundOn()) playLandingTick();
  };
  /** Undo for the edit the AI just made: what it added fades out on the timeline first, then the whole edit goes. */
  const undoAiEdit = () => {
    const done = change; if (!done) return;
    setLeaving(done.ids); clearTimeout(autoStop.current);
    setTimeout(() => {
      setLeaving(new Set()); commit(done.before, 'Undo AI edit'); setChange(null);
      setMessages(m => [...m, { role: 'assistant', text: `Undone: ${done.summary} That change is no longer on the timeline.` }]);
    }, 280);
  };
  const exportVideo = async () => {
    if (!total || locked || operation.current) return;
    const abort = new AbortController(); exportAbort.current = abort; setExporting(true); setPlaying(false); setNotice(''); setExported(null);
    setExportStage({ label: 'Drawing titles and captions', share: 0 });
    try {
      const valid = validateTimeline(timeline, assets); const form = new FormData(); form.set('timeline', JSON.stringify(valid));
      // An image used only as an overlay still has to travel, or the server cannot check the cut.
      const used = new Set([...timeline.clips, ...timeline.audio, ...timeline.overlays, ...timeline.videoOverlays].map(c => c.assetId).filter(Boolean)); const media = assets.filter(a => used.has(a.id));
      // Footage on disk is read by the server where it is; only media kept in this browser travels with the request.
      form.set('assets', JSON.stringify(media.map(a => ({ id: a.id, name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, ...(a.disk ? { diskId: a.disk.id } : {}) }))));
      for (const a of media) if (!a.disk) { if (!a.blob) throw new Error(`“${a.name}” is missing from this project. Add it again.`); form.set(a.id, a.blob, a.name); }
      const [w, h] = dimensions(timeline.format); await loadEditorFonts();
      // Titles, logos, counters, captions and flashes: drawn here with the preview's own code, frame by frame.
      const layer = await renderLayerFrames(valid, assets, w, h, total, share => setExportStage({ label: 'Drawing titles and captions', share: share * .15 }));
      form.set('motion', JSON.stringify(layer.holds)); layer.frames.forEach((frame, i) => form.set(`motion-${i}`, frame, 'frame.png'));
      // Text behind the player: the titles under the object and the object's matte, stacked by FFmpeg like the preview.
      for (const [name, seq] of [['below', layer.below], ['matte', layer.matte]] as const) if (seq) { form.set(name, JSON.stringify(seq.holds)); seq.frames.forEach((frame, i) => form.set(`${name}-${i}`, frame, 'frame.png')); }
      setExportStage({ label: 'Rendering from your original files', share: .15 });
      const response = await fetch('/api/video/export', { method: 'POST', headers: { 'x-bopzi-local': '1' }, body: form, signal: abort.signal });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error || 'The video could not be exported.');
      // A line per update: progress, then the saved file or what went wrong.
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader(); let pending = '', result: { file: string; name: string } | null = null;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        pending += value; const lines = pending.split('\n'); pending = lines.pop() ?? '';
        for (const text of lines.filter(Boolean)) {
          const update = JSON.parse(text);
          if (update.error) throw new Error(update.error);
          if (typeof update.progress === 'number') setExportStage({ label: 'Rendering from your original files', share: .15 + .85 * update.progress });
          if (update.done) result = { file: update.file, name: update.name };
        }
      }
      if (!result) throw new Error('The export stopped before it finished.');
      setExported(result);
    } catch (e) { setNotice(abort.signal.aborted ? 'Export cancelled.' : e instanceof Error ? e.message : 'The video could not be exported.'); }
    finally { setExporting(false); setExportStage(null); exportAbort.current = null; }
  };
  const openProjects = async () => { try { await saveVideoProject({ id: projectId, timeline, messages, revisions: past, cuts, updatedAt: Date.now() }); router.push('/projects/video'); } catch { setNotice('Saved projects could not be opened from this browser.'); } };
  const duplicateLayer = (id: string) => { const group = timeline.compounds?.find(g => g.members.includes(id) && (g.collapsed || timeline.clips.some(c => c.id === id))); if (group) { try { commit(validateTimeline(duplicateCompound(timeline, group.id), assets), 'Duplicate compound'); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not duplicate compound.'); } return; } const next = duplicateItem(timeline, id); try { validateTimeline(next.timeline, assets); commit(next.timeline, 'Duplicate layer'); setSelected(next.id); } catch (e) { setNotice(e instanceof Error ? e.message : 'Cannot duplicate layer.'); } };
  const duplicate = () => { if (selected && !locked && !selectedLocked) duplicateLayer(selected); };
  const copyTimelineSelection = () => {
    const copied = copySelectionIds.flatMap<CopyableTimelineItem>(id => {
      const title = timeline.titles.find(item => item.id === id); if (title) return [{ kind: 'title' as const, item: title }];
      const caption = timeline.captions.find(item => item.id === id); if (caption) return [{ kind: 'caption' as const, item: caption }];
      const zoom = timeline.effects.find((item): item is Extract<Effect, { kind: 'zoom' }> => item.id === id && item.kind === 'zoom');
      return zoom ? [{ kind: 'zoom' as const, item: zoom }] : [];
    }).sort((a, b) => a.item.start - b.item.start);
    if (!copied.length) return false;
    timelineClipboard.current = copied; setHasTimelineClipboard(true);
    setNotice(`Copied ${copied.length} timeline item${copied.length === 1 ? '' : 's'}. Paste at the playhead with Ctrl/⌘V.`);
    return true;
  };
  const pasteTimelineSelection = () => {
    const copied = timelineClipboard.current;
    if (!copied?.length || locked) return;
    const first = copied[0].item.start, shift = Math.max(0, time) - first;
    const next: Timeline = { ...timeline, titles: [...timeline.titles], captions: [...timeline.captions], effects: [...timeline.effects], layerSettings: { ...timeline.layerSettings } };
    const newIds: string[] = [];
    for (const entry of copied) {
      const id = uid(), start = Math.max(0, entry.item.start + shift);
      if (entry.kind === 'title') next.titles.push({ ...entry.item, id, start });
      else if (entry.kind === 'caption') next.captions.push({ ...entry.item, id, start, ...(entry.item.style ? { style: { ...entry.item.style } } : {}) });
      else next.effects.push({ ...entry.item, id, start });
      const label = items(timeline, assets).find(item => item.id === entry.item.id)?.label ?? entry.kind;
      next.layerSettings![id] = { ...timeline.layerSettings?.[entry.item.id], locked: false, name: `${label} copy` };
      newIds.push(id);
    }
    try {
      const valid = validateTimeline(next, assets);
      commit(valid, copied.length === 1 ? 'Paste timeline item' : 'Paste timeline items');
      const id = newIds.at(-1)!; setSelectedState(id); setSelectedIds([id]); setAiScope('selected');
      if (next.captions.some(c => c.id === id)) setInspectorOpen(true);
      setNotice(`Pasted ${copied.length} item${copied.length === 1 ? '' : 's'} at the playhead.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not paste here.'); }
  };
  const setLayerSettings = (id: string, patch: LayerSettings) => commit({ ...timeline, layerSettings: { ...timeline.layerSettings, [id]: { ...timeline.layerSettings?.[id], ...patch } } }, 'Adjust layer settings');
  const deleteLayer = (id: string) => { if (timeline.layerSettings?.[id]?.locked) return; const next = { ...timeline }; for (const key of ['clips', 'titles', 'overlays', 'videoOverlays', 'effects', 'captions', 'audio'] as const) Object.assign(next, { [key]: timeline[key].filter(i => i.id !== id) }); commit(next, 'Delete layer'); if (selectedIds.includes(id)) { const rest = selectedIds.filter(item => item !== id); setSelectedState(selected === id ? rest.at(-1) ?? null : selected); setSelectedIds(rest); } };

  const reorder = (id: string, before: string) => { if (timeline.compounds?.some(g => g.members.includes(id) || g.members.includes(before))) { commit(reorderCompound(timeline, id, before), 'Move compound clip'); return; } if (locked || id === before || timeline.layerSettings?.[id]?.locked || timeline.layerSettings?.[before]?.locked) return; const moving = timeline.clips.find(c => c.id === id); if (!moving) return; const clips = timeline.clips.filter(c => c.id !== id); const at = clips.findIndex(c => c.id === before); clips.splice(at < 0 ? clips.length : at, 0, moving); commit({ ...timeline, clips }, 'Reorder clips'); };
  const moveClip = (direction: number) => { if (clip && !selectedLocked) commit(moveFootage(timeline, clip.id, direction), 'Move footage'); };
  // Selection always exposes the controls for that element.
  const showItem = (id: string) => { setSelected(id); setAiScope(timeline.clips.some(c => c.id === id) ? 'project' : 'selected'); if (timeline.captions.some(c => c.id === id)) setInspectorOpen(true); };
  const selectTimelineItem = (id: string, additive = false, range = false) => {
    let ids: string[];
    if (range && selected) {
      const ordered = items(visibleTimeline(timeline), assets).sort((a, b) => a.start - b.start).map(item => item.id);
      const from = ordered.indexOf(selected), to = ordered.indexOf(id);
      ids = from >= 0 && to >= 0 ? ordered.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
    } else if (additive) {
      ids = selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id];
      if (!ids.length) { setSelected(null); return; }
    } else ids = [id];
    const primary = additive && !ids.includes(id) ? ids.at(-1) ?? null : id;
    setSelectedState(primary); setSelectedIds(ids);
    if (timeline.captions.some(c => c.id === primary)) setInspectorOpen(true);
    if (primary) setAiScope(timeline.clips.some(c => c.id === primary) ? 'project' : 'selected');
    if (timeline.effects.some(e => e.id === id && e.kind === 'zoom')) { setPlaying(false); setAimingZoom(true); }
  };
  const switchMode = (mode: Mode) => {
    if (mode === timeline.mode || locked) return;
    if (total > maxLength(mode)) { setNotice(`${MODES[mode].label} cuts stay under ${lengthLabel(mode)}. Trim this one first.`); return; }
    const name = timeline.name === MODES[timeline.mode].name ? MODES[mode].name : timeline.name;
    commit({ ...timeline, mode, name, format: MODES[mode].format }, `Switch to ${MODES[mode].label}`);
  };
  // ---- editing on the video itself: click text to retype it, drag text and logos to move them
  const measure = useRef<CanvasRenderingContext2D | null>(null);
  const [frameW, frameH] = dimensions(timeline.format);
  const aspectOf = (o: Overlay) => { const a = o.source === 'image' ? assets.find(m => m.id === o.assetId) : undefined; return a ? a.width / a.height : 1; };
  /** The area an item covers in the frame, or null when it is not on screen now. */
  const boxes = () => { const ctx = measure.current ??= document.createElement('canvas').getContext('2d')!; return layerBoxes(ctx, timeline, assets, time, frameW, frameH); };
  const boxOf = (id: string) => boxes().find(b => b.id === id) ?? null;
  const hitAt = (x: number, y: number) => [...boxes()].reverse().find(b => !timeline.layerSettings?.[b.id]?.locked && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.id;
  const startPlayerControlsDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button')) return;
    const controls = e.currentTarget, frame = controls.parentElement;
    if (!frame) return;
    e.preventDefault();
    const frameRect = frame.getBoundingClientRect(), controlsRect = controls.getBoundingClientRect();
    playerControlsDrag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, centerX: controlsRect.left + controlsRect.width / 2, centerY: controlsRect.top + controlsRect.height / 2, frame };
    setPlayerControlsPosition({ x: (controlsRect.left + controlsRect.width / 2 - frameRect.left) / frameRect.width, y: (controlsRect.top + controlsRect.height / 2 - frameRect.top) / frameRect.height });
    try { controls.setPointerCapture(e.pointerId); } catch { /* pointer capture is optional */ }
  };
  const movePlayerControls = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const drag = playerControlsDrag.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const frameRect = drag.frame.getBoundingClientRect(), controlsRect = e.currentTarget.getBoundingClientRect();
    const halfW = controlsRect.width / 2, halfH = controlsRect.height / 2;
    const centerX = Math.min(frameRect.right - halfW, Math.max(frameRect.left + halfW, drag.centerX + e.clientX - drag.startX));
    const centerY = Math.min(frameRect.bottom - halfH, Math.max(frameRect.top + halfH, drag.centerY + e.clientY - drag.startY));
    setPlayerControlsPosition({ x: (centerX - frameRect.left) / frameRect.width, y: (centerY - frameRect.top) / frameRect.height });
  };
  const endPlayerControlsDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (playerControlsDrag.current?.pointerId === e.pointerId) playerControlsDrag.current = null;
  };
  const pressStage = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked || editing || (e.target as HTMLElement).closest('input')) return;
    // The artboard can be wider than the actual video (for example when a
    // landscape frame is fitted into a tall preview area). Layer positions
    // are relative to the video frame, so use its bounds for hit testing and
    // drag deltas rather than the surrounding artboard.
    const frame = e.currentTarget.querySelector('.ve-preview-canvas')?.getBoundingClientRect();
    if (!frame || !frame.width || !frame.height) return;
    const scaleX = frameW / frame.width, scaleY = frameH / frame.height;
    const id = hitAt((e.clientX - frame.left) * scaleX, (e.clientY - frame.top) * scaleY);
    if (!id) { setSelected(null); return; }
    showItem(id); setPlaying(false);
    const original = latest.current.timeline, startX = e.clientX, startY = e.clientY, target = e.currentTarget; let moved = false;
    try { target.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone; the drag still follows events on the frame */ }
    // While dragging, the cut changes without history; letting go records it once.
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / frame.width, dy = (ev.clientY - startY) / frame.height; if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return; moved = true;
      const clamp = (v: number) => Math.min(.97, Math.max(.03, v));
      const next = original.captions.some(c => c.id === id) ? { ...original, captions: original.captions.map(c => c.id === id ? { ...c, x: Math.min(.97, Math.max(.03, (c.x ?? original.captionStyle.x ?? .5) + dx)), y: Math.min(.95, Math.max(.05, (c.y ?? original.captionStyle.y) + dy)) } : c) }
        : { ...original, titles: original.titles.map(t => t.id === id ? { ...t, x: clamp(t.x + dx), y: clamp(t.y + dy) } : t), overlays: original.overlays.map(o => o.id === id ? { ...o, x: clamp(o.x + dx), y: clamp(o.y + dy) } : o), videoOverlays: original.videoOverlays.map(o => o.id === id && o.layout === 'pip' ? { ...o, x: clamp(o.x + dx), y: clamp(o.y + dy) } : o), effects: original.effects.map(e => e.id === id && (e.kind === 'counter' || e.kind === 'highlight' || e.kind === 'blur' || e.kind === 'bar') ? { ...e, x: clamp(e.x + dx), y: clamp(e.y + dy) } : e) };
      latest.current.timeline = next; setTimeline(next);
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel);
      if (moved) { setPast(p => [...p.slice(-39), { timeline: original, label: 'Move on video', at: Date.now() }]); setFuture([]); return; }
      const caption = original.captions.find(c => c.id === id), title = original.titles.find(t => t.id === id);
      if (caption || title) setEditing({ id, text: (caption ?? title)!.text }); else openInspector();
    };
    const cancel = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); latest.current.timeline = original; setTimeline(original); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  const finishEditing = (save: boolean) => {
    if (!editing) return; const { id, text } = editing; setEditing(null);
    if (!save) return;
    if (timeline.captions.some(c => c.id === id)) updateCaption(id, { text: text.slice(0, 120) });
    else commit({ ...timeline, titles: timeline.titles.map(t => t.id === id ? { ...t, text: text.slice(0, 160) } : t) }, 'Edit title');
  };
  const resizeStage = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (locked || selectedLocked || !selected) return; e.preventDefault(); e.stopPropagation();
    // A highlight's box is resized from its corner: the opposite corner stays put and the box follows the pointer.
    const marked = timeline.effects.find((i): i is HighlightEffect => i.id === selected && i.kind === 'highlight');
    if (marked) {
      const board = e.currentTarget.closest('.ve-artboard')!.getBoundingClientRect(), original = timeline, target = e.currentTarget, x0 = e.clientX, y0 = e.clientY; let next = original;
      const left = marked.x - marked.w / 2, top = marked.y - marked.h / 2;
      target.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const w = Math.min(1 - left, Math.max(.03, marked.w + (ev.clientX - x0) / board.width)), h = Math.min(1 - top, Math.max(.03, marked.h + (ev.clientY - y0) / board.height));
        next = patchItem(original, marked.id, { x: left + w / 2, y: top + h / 2, w, h }); setTimeline(next); latest.current.timeline = next;
      };
      const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
      const up = () => { clean(); latest.current.timeline = original; commit(next, 'Resize highlight'); };
      const cancel = () => { clean(); latest.current.timeline = original; setTimeline(original); };
      target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
      return;
    }
    const item = timeline.titles.find(i => i.id === selected) ?? timeline.overlays.find(i => i.id === selected) ?? timeline.videoOverlays.find(i => i.id === selected && i.layout === 'pip') ?? timeline.effects.find(i => i.id === selected && i.kind === 'counter');
    const caption = timeline.captions.some(c => c.id === selected); if (!item && !caption) return;
    const captionItem = timeline.captions.find(c => c.id === selected), size = item && 'size' in item ? item.size : captionItem?.style?.size ?? timeline.captionStyle.size, original = timeline, target = e.currentTarget, y = e.clientY; let next = original;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { const limit = caption || timeline.titles.some(i => i.id === selected) ? .18 : timeline.overlays.some(i => i.id === selected) ? .8 : timeline.videoOverlays.some(i => i.id === selected) ? 1 : .3; const value = Math.min(limit, Math.max(timeline.videoOverlays.some(i => i.id === selected) ? .05 : .03, size + (ev.clientY - y) / 500)); next = caption && captionItem ? { ...original, captions: original.captions.map(c => c.id === captionItem.id ? { ...c, style: { ...c.style, size: value } } : c) } : patchItem(original, selected, { size: value }); setTimeline(next); latest.current.timeline = next; };
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
    const up = () => { clean(); latest.current.timeline = original; commit(next, 'Resize layer'); };
    const cancel = () => { clean(); latest.current.timeline = original; setTimeline(original); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  // ---- aiming a zoom on the full, unzoomed frame. The box is exactly what fills the screen at full zoom: a share of
  // 1/strength of the frame. The camera (cameraAt) puts it at left = focus × (1 − 1/strength), so a box centre maps back
  // to a focus point, and a box that stays inside the frame is always one the camera can show.
  const zoomEffect = effect?.kind === 'zoom' ? effect : undefined;
  const zoomFrom = zoomEffect ? heldZoomAt(visibleTimeline(timeline).effects.filter(e => e.id !== zoomEffect.id), zoomEffect.start)?.zoom ?? 1 : 1;
  // Selecting or pausing a zoom must keep showing the rendered camera. Only
  // explicitly adjusting its framing should reveal the unzoomed source.
  const [aimingZoom, setAimingZoom] = useState(false);
  const [selectingZoomTarget, setSelectingZoomTarget] = useState(false);
  const [zoomTargetBox, setZoomTargetBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => { setAimingZoom(!!selected && timeline.effects.some(e => e.id === selected && e.kind === 'zoom')); setSelectingZoomTarget(false); setZoomTargetBox(null); }, [selected]);
  const aiming = aimingZoom && !!zoomEffect && !playing && !editing;
  const zoomSubject = zoomEffect?.follow ? timeline.effects.find((e): e is HighlightEffect => e.id === zoomEffect.follow && e.kind === 'highlight') : undefined;
  const zoomFocus = zoomSubject ? trackedPointSmooth(zoomSubject, time) : zoomEffect;
  const zoomBox = zoomEffect && zoomFocus && { x: zoomFocus.x * (1 - 1 / zoomEffect.amount), y: zoomFocus.y * (1 - 1 / zoomEffect.amount), size: 1 / zoomEffect.amount };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  /** The zoom whose box is centred near (cx, cy) with this strength, nudged so the box stays inside the frame. */
  const zoomAt = (cx: number, cy: number, amount: number) => {
    const size = 1 / amount, focus = (c: number) => size >= .999 ? .5 : clamp((c - size / 2) / (1 - size), 0, 1);
    return { x: Math.round(focus(cx) * 1000) / 1000, y: Math.round(focus(cy) * 1000) / 1000, amount: Math.round(amount * 100) / 100 };
  };
  /** Play once, then leave the actual held framing visible at the playhead. */
  const [replayUntil, setReplayUntil] = useState<number | null>(null);
  const replayZoom = (z: { start: number; duration: number }) => { setAimingZoom(false); setTime(Math.max(0, z.start - .4)); setReplayUntil(Math.min(total, z.start + z.duration + .3)); setPlaying(true); };
  useEffect(() => { if (replayUntil !== null && (time >= replayUntil || !playing)) { setPlaying(false); setReplayUntil(null); } }, [time, playing, replayUntil]);
  const changeZoom = (patch: Partial<Effect>, label: string) => { if (!zoomEffect || selectedLocked) return; commit(patchItem(timeline, zoomEffect.id, patch), label); };
  /** Move the crop or its focal marker, size from a corner, or click the source frame to choose a new target. */
  const aimZoom = (part: 'move' | 'target' | 'corner' | 'frame') => (e: React.PointerEvent<HTMLElement>) => {
    if (!zoomEffect || !zoomBox || locked || selectedLocked) return; e.preventDefault(); e.stopPropagation(); setPlaying(false); setReplayUntil(null);
    if (part !== 'corner') setZoomTargetBox(null);
    const board = (e.currentTarget.closest('.ve-artboard') as HTMLElement).getBoundingClientRect(), original = latest.current.timeline, z = zoomEffect, target = e.currentTarget;
    const at = (ev: { clientX: number; clientY: number }) => ({ px: (ev.clientX - board.left) / board.width, py: (ev.clientY - board.top) / board.height });
    const start = at(e), centre = { x: zoomBox.x + zoomBox.size / 2, y: zoomBox.y + zoomBox.size / 2 };
    const place = (patch: Partial<Effect>) => { const adjusted = part === 'corner' || !z.follow ? patch : { ...patch, follow: undefined }; const next = patchItem(original, z.id, adjusted); latest.current.timeline = next; setTimeline(next); return next; };
    // A press on the frame aims there straight away, and the drag that follows keeps moving it.
    let next = part === 'frame' ? place(zoomAt(start.px, start.py, z.amount)) : original;
    let moved = false;
    const from = part === 'frame' ? { x: start.px, y: start.py } : centre;
    try { target.setPointerCapture(e.pointerId); } catch { /* the drag still follows events on the handle */ }
    const move = (ev: PointerEvent) => {
      const p = at(ev);
      if (Math.abs(p.px - start.px) + Math.abs(p.py - start.py) > .004) moved = true;
      if (part === 'corner') {
        // Half the box's side is the farther of the two distances from its centre, so any corner works the same way.
        const half = Math.max(Math.abs(p.px - centre.x), Math.abs(p.py - centre.y));
        next = place(zoomAt(centre.x, centre.y, clamp(1 / Math.max(.02, half * 2), 1.05, 2.5)));
      } else next = place(zoomAt(from.x + p.px - start.px, from.y + p.py - start.py, z.amount));
    };
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
    const up = () => { clean(); if (part === 'move' && !moved) next = place(zoomAt(start.px, start.py, z.amount)); latest.current.timeline = original; commit(next, part === 'corner' ? 'Set zoom strength' : 'Aim zoom'); };
    const cancel = () => { clean(); latest.current.timeline = original; setTimeline(original); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  /** Draw a separate target region; its centre becomes the camera anchor while the crop keeps its current strength. */
  const drawZoomTarget = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!zoomEffect || locked || selectedLocked || !selectingZoomTarget) return;
    e.preventDefault(); e.stopPropagation(); setPlaying(false); setReplayUntil(null);
    const board = (e.currentTarget.closest('.ve-artboard') as HTMLElement).getBoundingClientRect(), target = e.currentTarget;
    const at = (ev: { clientX: number; clientY: number }) => ({ x: clamp((ev.clientX - board.left) / board.width, 0, 1), y: clamp((ev.clientY - board.top) / board.height, 0, 1) });
    const start = at(e), z = zoomEffect; let box = { x: start.x, y: start.y, w: 0, h: 0 };
    setZoomTargetBox(box);
    try { target.setPointerCapture(e.pointerId); } catch { /* keep tracking the drag if capture is unavailable */ }
    const move = (ev: PointerEvent) => {
      const p = at(ev), x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
      box = { x, y, w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      setZoomTargetBox(box);
    };
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
    const up = (ev: PointerEvent) => {
      clean();
      const end = at(ev), finalBox = box.w < .015 || box.h < .015 ? { x: end.x, y: end.y, w: 0, h: 0 } : box;
      const next = zoomAt(finalBox.x + finalBox.w / 2, finalBox.y + finalBox.h / 2, z.amount);
      changeZoom({ ...next, follow: undefined }, 'Aim zoom at selected subject');
      setZoomTargetBox(finalBox); setSelectingZoomTarget(false);
    };
    const cancel = () => { clean(); setZoomTargetBox(null); setSelectingZoomTarget(false); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  const paintHighlight = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !refiningHighlight || !brushMode || selectedLocked || locked || tracing) return;
    e.preventDefault(); e.stopPropagation(); setPlaying(false);
    const original = latest.current.timeline, h = refiningHighlight, target = e.currentTarget, rect = target.getBoundingClientRect();
    const [fw, fh] = dimensions(original.format), fps = h.mask?.fps ?? 12;
    const mask = h.mask ?? { start: h.start, fps, w: Math.round(640 * Math.min(1, fw / fh)), h: Math.round(640 * Math.min(1, fh / fw)), frames: Array.from({ length: Math.min(900, Math.max(1, Math.ceil(h.duration * fps))) }, () => '') };
    const frame = Math.max(0, Math.min(mask.frames.length - 1, Math.round((time - mask.start) * fps)));
    const point = (ev: { clientX: number; clientY: number }): BrushPoint => ({ x: Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height)) });
    const stroke: BrushPoint[] = [point(e)]; let currentMask = mask, next = original;
    const previewStroke = (points: BrushPoint[]) => {
      currentMask = brushMask(currentMask, points, brushSize / 200, brushMode === 'paint', frame);
      next = patchItem(original, h.id, { mask: currentMask, style: 'tint' });
      latest.current.timeline = next; setTimeline(next);
    };
    previewStroke(stroke); target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => { const previous = stroke.at(-1)!; stroke.push(point(ev)); previewStroke([previous, stroke.at(-1)!]); };
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); target.removeEventListener('lostpointercapture', cancel); };
    const up = () => { clean(); if (brushAll) next = patchItem(original, h.id, { mask: brushMask(mask, stroke, brushSize / 200, brushMode === 'paint'), style: 'tint' }); latest.current.timeline = original; commit(next, brushMode === 'paint' ? 'Brush highlight' : 'Erase highlight'); };
    const cancel = () => { clean(); latest.current.timeline = original; setTimeline(original); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true }); target.addEventListener('lostpointercapture', cancel, { once: true });
  };
  const selectedBox = selected && !editing && !refiningHighlight ? boxOf(selected) : null;
  const editingBox = editing ? boxOf(editing.id) : null;
  const editingItem = editing ? timeline.captions.find(c => c.id === editing.id) ? captionText(timeline, timeline.captions.find(c => c.id === editing.id)!) : timeline.titles.find(t => t.id === editing.id) : undefined;
  const pct = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x / frameW * 100}%`, top: `${b.y / frameH * 100}%`, width: `${b.w / frameW * 100}%`, height: `${b.h / frameH * 100}%` });
  const cycleSpeed = () => { if (clip) updateClip({ speedPoints: undefined, speed: [1, 1.5, 2, .5][([1, 1.5, 2, .5].indexOf(clip.speed) + 1) % 4] ?? 1 }); };
  const makeProxy = async (id: string) => {
    if (locked || operation.current) return; const a = assets.find(a => a.id === id); if (!a) return;
    operation.current = true; setBusy('Making lightweight preview copy'); setNotice('');
    try { if (a.disk || !a.blob) throw new Error('Footage on disk gets its preview copy automatically.'); const form = new FormData(); form.set('file', a.blob, a.name); const response = await fetch('/api/video/proxy', { method: 'POST', headers: { 'x-bopzi-local': '1' }, body: form }); if (!response.ok) throw new Error((await response.json()).error || 'Could not make preview copy.'); const proxyBlob = await response.blob(), updated = { ...a, proxyBlob, proxyUrl: URL.createObjectURL(proxyBlob) }; try { await saveMedia(projectId, updated); } catch (e) { URL.revokeObjectURL(updated.proxyUrl); throw e; } if (a.proxyUrl) URL.revokeObjectURL(a.proxyUrl); const next = latest.current.assets.map(m => m.id === id ? updated : m); latest.current.assets = next; setAssets(next); setUseProxies(true); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not make preview copy.'); } finally { operation.current = false; setBusy(''); }
  };

  const status = aiBusy ? aiStage || 'Working on your cut…' : captioning || (applyingProposal ? 'Applying your edit…' : '');

  return <div className={`studio creator-studio v2 ve ve-grid ai-first no-library ${inspectorOpen ? 'has-inspector' : ''} ${tracks ? 'detailed-tracks' : ''} text-[13px] text-ui-fg ${dark ? 'is-dark' : ''}`} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); return; } const paths = mediaPaths(e.dataTransfer.getData('text')); if (paths.length) { e.preventDefault(); void addFromPaths(paths); } }}>
    <header className="studio-top" inert={!!review}>
      <div className="studio-name"><input aria-label="Project name" maxLength={80} disabled={locked} value={timeline.name} onChange={e => commit({ ...timeline, name: e.target.value }, 'Rename project')} onBlur={() => { if (!timeline.name.trim()) commit({ ...timeline, name: MODES[timeline.mode].name }, 'Rename project'); }}/><span role="status" aria-live="polite"><Check size={11} className="save-check"/>{saved}</span></div>
      <span className="flex-1"/>
      <div className="ve-modes" role="radiogroup" aria-label="What are you making?">{(Object.keys(MODES) as Mode[]).map(mode => { const Icon = MODE_COPY[mode].icon; return <button type="button" key={mode} role="radio" aria-checked={timeline.mode === mode} title={MODE_COPY[mode].hint} disabled={locked} onClick={() => switchMode(mode)}><Icon size={14}/><span>{MODES[mode].label}</span></button>; })}</div>
      <select className="finput ve-format" aria-label="Aspect ratio" value={timeline.format} disabled={locked} onChange={e => commit({ ...timeline, format: e.target.value as Timeline['format'] }, 'Change format')}><option value="landscape">16:9</option><option value="vertical">9:16</option><option value="square">1:1</option></select>
      <span className="flex-1"/>
      <IconBtn tip="Earlier cuts" onClick={() => setHistoryOpen(true)}><History size={16}/></IconBtn>
      <span className="studio-wide"><IconBtn tip={dark ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</IconBtn></span>
      <IconBtn tip="Sounds and music" aria-pressed={tool === 'audio' && !inspectorOpen} onClick={() => { setInspectorOpen(false); setTool(t => t === 'audio' && !inspectorOpen ? null : 'audio'); }}><Music2 size={16}/></IconBtn>
      <IconBtn tip="Video projects" disabled={locked} onClick={() => void openProjects()}><FolderOpen size={16}/></IconBtn>
      <button type="button" className="ebtn go" disabled={!total || locked} aria-busy={exporting} onClick={() => void exportVideo()}>{exporting ? <i className="spinner"/> : <Download size={15}/>}<span className="studio-go-label">{exporting ? 'Exporting…' : 'Export video'}</span></button>
    </header>

    {(inspectorOpen ? ['properties' as Tool] : tool === 'audio' ? ['audio' as Tool] : []).map(drawerTool => <aside key="inspector" className="tool-drawer ve-panel ve-inspector" aria-label={drawerTool === 'audio' ? 'Sounds and music' : 'Properties'} inert={!!review}>
      {drawerTool === 'audio' ? <header><h2>Sounds and music</h2><button type="button" aria-label="Close sounds" title="Close sounds" onClick={() => setTool(null)}><X size={16}/></button></header>
      : <header><h2>{clip ? 'Clip' : title ? 'Title' : selectedCaption ? 'Caption' : audio ? 'Audio' : effect ? EFFECT_LABELS[effect.kind] : overlay ? overlay.source === 'icon' ? `${ICONS[overlay.icon as keyof typeof ICONS]?.label ?? ''} logo` : 'Image' : videoOverlay ? 'Video on top' : 'Properties'}</h2><button type="button" aria-label="Close manual properties" title="Close manual properties" onClick={() => setInspectorOpen(false)}><X size={16}/></button></header>}
      <div className="tool-drawer-body">
        {(drawerTool === 'media' || drawerTool === 'audio') && <><MediaLibrary assets={libraryAssets} audio={drawerTool === 'audio'} query={query} disabled={locked} onQuery={setQuery} onImport={() => void chooseMedia()} onAdd={addAsset} onRemove={id => { try { const name = assets.find(a => a.id === id)?.name ?? 'File'; commit(removeMediaFromProject(timeline, id), 'Remove media from project'); setSelected(null); setNotice(`Removed ${name} from this project. Ctrl Z to undo.`); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not remove media.'); } }}/>{drawerTool === 'audio' && <SoundLibrary query={query} disabled={locked} packRoot={packRoot} onAdd={s => void addSound(s)} onAddOwn={s => void addOwnSound(s)}/>}</>}
        {drawerTool === 'workflow' && <WorkflowPanel timeline={timeline} assets={assets} selected={selected} time={time} disabled={locked} quality={quality} proxies={useProxies} loop={loop} cuts={cuts} onCommit={(next, label) => { try { commit(validateTimeline(next, assets), label); } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not change this edit.'); } }} onNotice={setNotice} onSeek={seek} onSelect={setSelected} onQuality={setQuality} onProxies={setUseProxies} onMakeProxy={id => void makeProxy(id)} onLoop={setLoop} onSaveCut={name => { setCuts(c => [...c, { id: uid(), name: name.trim().slice(0, 80), timeline: structuredClone(timeline), at: Date.now() }]); setNotice('Named cut saved on this device.'); }} onReviewCut={cut => { setPlaying(false); setReview({ before: timeline, after: cut.timeline, label: cut.name, summary: 'Compare this saved cut with your current edit. Restoring it is one Undo step.', source: 'cut' }); }} onDeleteCut={id => setCuts(c => c.filter(v => v.id !== id))}/>}
        {drawerTool === 'text' && <><p className="tool-note">Titles in the studio's fonts. Add one, then make it yours.</p><div className="ve-text-presets">{modeText.titles.map((text, i) => <button key={text} disabled={locked} onClick={() => addText(text)} style={{ color: TITLE_COLORS[i], fontFamily: fontOf('luckiest').family }}>{text}</button>)}</div><button className="ebtn w-full" disabled={locked} onClick={() => addText('Your text here')}><Plus size={16}/>Add your own text</button></>}
        {drawerTool === 'logos' && <>
          <p className="tool-note">Put a logo or one of your images on top of the video. Drag it on the preview to place it.</p>
          <div className="ve-logo-grid">{(Object.keys(ICONS) as (keyof typeof ICONS)[]).map(key => <button type="button" key={key} disabled={locked || !total} title={`Add the ${ICONS[key].label} logo`} onClick={() => addOverlay({ icon: key })}><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(key, 'badge'))}`} alt=""/><span>{ICONS[key].label}</span></button>)}</div>
          <p className="tool-note">Your images</p>
          <div className="ve-media-grid">{libraryAssets.filter(a => a.kind === 'image').map(a => <button type="button" className="ve-media" disabled={locked || !total} key={a.id} title={`Put ${a.name} on top of the video`} onClick={() => addOverlay({ assetId: a.id })}><div>{a.poster && <img src={a.poster} alt=""/>}<i><Plus size={13}/></i></div><b>{a.name}</b></button>)}</div>
          <button className="ebtn w-full" disabled={locked} onClick={() => file.current?.click()}><Upload size={16}/>Upload a logo or image</button>
          <p className="tool-note">Logos come from Simple Icons. Each brand belongs to its owner, so use them to point to your own channels.</p>
        </>}
        {drawerTool === 'layers' && <LayerPanel timeline={timeline} assets={assets} selected={selected} disabled={locked} query={layerQuery} onQuery={setLayerQuery} onSelect={id => { const layer = items(timeline, assets).find(i => i.id === id); showItem(id); if (layer) seek(Math.min(total, layer.start + Math.min(.35, layer.duration / 2))); }} onSettings={setLayerSettings} onDuplicate={duplicateLayer} onDelete={deleteLayer}/>}
        {drawerTool === 'effects' && <><label className="ve-checkbox ve-auto-sfx"><input type="checkbox" checked={autoSfx} onChange={e => toggleAutoSfx(e.target.checked)}/>Add sound effects to new effects</label><EffectLibrary disabled={locked || !total} onAdd={addEffect} presets={presets} onAddPreset={addPreset} onDeletePreset={id => keepPresets(presets.filter(p => p.id !== id))}/></>}
        {drawerTool === 'captions' && <>
          <button className="ebtn w-full" disabled={locked || !total} onClick={() => void autoCaptions()}>{captioning ? <Loader2 className="ve-spin" size={15}/> : <Captions size={16}/>}{captioning || (timeline.captions.length ? 'Make captions again' : 'Make captions from speech')}</button>
          <p className="tool-note">Bopzi listens to your clips on this computer and writes what is said. The first time, it downloads a speech model of about 100 MB.</p>
          <div className="ve-caption-presets" role="group" aria-label="Caption looks">{CAPTION_PRESETS.map(p => <button type="button" key={p.id} disabled={locked} aria-pressed={timeline.captionStyle.preset === p.id} className={`is-${p.id}`} style={{ fontFamily: face(p.style.font ?? 'fredoka').family, ['--active' as string]: p.style.activeColor, ['--glow' as string]: p.style.glow ?? 'transparent' }} onClick={() => styleCaptions({ ...p.style, preset: p.id })}><span>{p.style.uppercase ? 'NO' : 'no'} <b>{p.style.uppercase ? 'WAY' : 'way'}</b></span><small>{p.label}</small></button>)}</div>
          <label className="ve-field">Font<select className="finput" value={timeline.captionStyle.font} disabled={locked} onChange={e => styleCaptions({ font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
          <div className="ve-caption-sample" style={{ fontFamily: face(timeline.captionStyle.font).family, fontWeight: Number(face(timeline.captionStyle.font).weight), color: timeline.captionStyle.color }}><span>{(timeline.captionStyle.uppercase ? 'WAIT, HE SAW ME?' : 'wait, he saw me?').split(' ').map((w, i) => <span key={i}>{i > 0 && ' '}<span className={i === 2 ? `is-active is-${timeline.captionStyle.active ?? 'pop'}` : undefined} style={i === 2 ? { ['--active' as string]: timeline.captionStyle.activeColor ?? '#ffd84d' } : undefined}>{w}</span></span>)}</span></div>
          <div className="ve-field-pair"><label className="ve-field">Colour<input className="finput" type="color" value={timeline.captionStyle.color} disabled={locked} onChange={e => styleCaptions({ color: e.target.value })}/></label><label className="ve-checkbox"><input type="checkbox" checked={timeline.captionStyle.uppercase} disabled={locked} onChange={e => styleCaptions({ uppercase: e.target.checked })}/>Capitals</label></div>
          <div className="ve-field-pair"><label className="ve-field">Word highlight<select className="finput" value={timeline.captionStyle.active ?? 'pop'} disabled={locked} onChange={e => styleCaptions({ active: e.target.value as CaptionStyle['active'] })}><option value="pop">Pop and colour</option><option value="karaoke">Karaoke (said words stay lit)</option><option value="box">Colour block</option><option value="none">Off</option></select></label>
            {timeline.captionStyle.active !== 'none' && <label className="ve-field">Highlight<input className="finput" type="color" value={timeline.captionStyle.activeColor ?? '#ffd84d'} disabled={locked} onChange={e => styleCaptions({ activeColor: e.target.value })}/></label>}</div>
          <Slider label="Size" value={timeline.captionStyle.size} min={.03} max={.12} step={.005} format={v => `${Math.round(v * 1000)}`} onChange={v => styleCaptions({ size: v })}/>
          <Slider label="Horizontal position" value={timeline.captionStyle.x ?? .5} min={.03} max={.97} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => styleCaptions({ x: v })}/>
          <Slider label="Height on screen" value={timeline.captionStyle.y} min={.1} max={.92} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => styleCaptions({ y: v })}/>
          {timeline.captions.length > 0 && <><div className="ve-caption-list">{timeline.captions.map(c => <label key={c.id} className={selected === c.id ? 'is-selected' : ''} onClick={() => { setSelected(c.id); seek(c.start); }}><span>{clock(c.start).slice(0, 5)}</span><input value={c.text} maxLength={120} disabled={locked} aria-label={`Caption at ${clock(c.start)}`} onChange={e => updateCaption(c.id, { text: e.target.value })}/></label>)}</div>
          <button className="ebtn w-full" disabled={locked} onClick={() => { commit({ ...timeline, captions: [] }, 'Remove captions'); setSelected(null); }}><Trash2 size={15}/>Remove all captions</button></>}
        </>}
        {drawerTool === 'styles' && <><RecipeLibrary disabled={locked || !total} onPreview={(id, options) => { try { const next = validateTimeline(applyRecipe(timeline, id, time, options), assets); const recipe = RECIPES.find(r => r.id === id)!; if (!timelineDifferences(timeline, next).differences.length) { setNotice('Move the playhead earlier to leave room for this pack.'); return; } setPlaying(false); setReview({ before: timeline, after: next, summary: recipe.hint + ' Every added layer is editable.', label: recipe.name, source: 'pack' }); } catch (e) { setNotice(e instanceof Error ? e.message : 'Cannot preview this pack.'); } }}/><details className="ve-pack-structures"><summary>Trailer structures</summary><div className="ve-templates">{TEMPLATES.map((t, i) => <button key={t.name} disabled={locked} onClick={() => applyTemplate(i)}><div style={{ '--template-color': t.color } as React.CSSProperties}><b style={{ fontFamily: fontOf('luckiest').family }}>{t.text}</b></div><strong>{t.name}</strong><small>{t.hint}</small></button>)}</div></details></>}
        {drawerTool === 'chat' && <><div className="ve-chat">{messages.map((m, i) => <div key={i} className={`ve-message is-${m.role}`}>{m.role === 'assistant' && <Sparkles size={13}/>}<p>{m.text}</p></div>)}{aiBusy && <div className="ve-message is-assistant" role="status"><Loader2 className="ve-spin" size={13}/><p>Working on your cut…</p></div>}<div ref={chatEnd}/></div><p className="tool-note">Describe edits in the bar under the preview. Every AI change can be undone.</p></>}
        {drawerTool === 'properties' && <>
          {selectedLayer && <><b>{selectedLayer.label}</b>{selectedLocked && <button type="button" className="ebtn" onClick={() => setLayerSettings(selected!, { locked: false })}>Unlock to edit</button>}{selectedLayer.kind !== 'clips' && <TimingEditor key={selected} start={selectedLayer.start} duration={selectedLayer.duration} total={total} countDelay={effect?.kind === 'counter' ? effect.countDelay ?? 0 : undefined} countDuration={effect?.kind === 'counter' ? effect.countDuration ?? Math.max(.2, effect.duration - .45) : undefined} anchors={[0, time, total, ...positions(timeline).flatMap(p => [p.start, p.end])]} disabled={locked || selectedLocked} onChange={patch => { if (selected) { if (audio && patch.duration !== undefined) patch.duration = Math.min(patch.duration, (pickedAsset?.duration ?? patch.duration) - audio.in); if (videoOverlay && pickedAsset?.kind === 'video' && patch.duration !== undefined) patch.duration = Math.min(patch.duration, pickedAsset.duration - videoOverlay.in); commit(patchItem(timeline, selected, patch), 'Adjust animation timing'); } }}/>}</>}

          {selectedLayer && selected && <>
            {selectedLayer.kind !== 'clips' && <label className="ve-field">Timing follows<select className="finput" disabled={locked || selectedLocked} value={timeline.layerSettings?.[selected]?.attachment?.clipId ?? ''} onChange={e => commit(attachLayer(timeline, selected, e.target.value || undefined), 'Attach layer timing')}><option value="">Timeline · stays at this time</option>{positions(timeline).map((p, i) => <option key={p.clip.id} value={p.clip.id}>{i + 1}. {assets.find(a => a.id === p.clip.assetId)?.name}</option>)}</select></label>}
            {(clip || title || overlay || effect?.kind === 'counter' || effect?.kind === 'highlight' || selectedLayer.kind === 'captions') && <MotionEditor key={selected} frames={clip?.keyframes ?? timeline.layerSettings?.[selected]?.keyframes} length={selectedLayer.duration} localTime={time - selectedLayer.start} disabled={locked || selectedLocked} onSeek={local => seek(selectedLayer.start + local)} onChange={keyframes => { if (clip) updateClip({ keyframes }); else setLayerSettings(selected, { keyframes }); }}/ >}
            {clip && clip.freeze === undefined && <SpeedEditor key={'speed-' + selected} points={clip.speedPoints} disabled={locked || selectedLocked} onChange={speedPoints => updateClip({ speedPoints })}/>}
          </>}
          {clip && pickedAsset && <fieldset className="ve-fields" disabled={locked || selectedLocked}>{pickedAsset.poster && <img className="ve-selected-media" src={pickedAsset.poster} alt=""/>}<b className="ve-selected-name">{pickedAsset.name}</b><div className="ve-field-pair"><NumberField label="In point" value={clip.in} min={0} max={clip.out - .1} onChange={v => updateClip({ in: v })}/><NumberField label="Out point" value={clip.out} min={clip.in + .1} max={pickedAsset.kind === 'image' ? 60 : pickedAsset.duration} onChange={v => updateClip({ out: v })}/></div><label className="ve-field">Speed<select className="finput" value={clip.speed} onChange={e => updateClip({ speed: Number(e.target.value), speedPoints: undefined })}>{[.25, .5, .75, 1, 1.25, 1.5, 2, 3, 4].map(n => <option value={n} key={n}>{n}×</option>)}</select></label><Slider label="Volume" value={clip.volume} min={0} max={1} step={.05} format={v => `${Math.round(v * 100)}%`} onChange={v => updateClip({ volume: v })}/>{(() => {
            // An "ease in and stay" zoom keeps framing the picture after its block, so the clip's own zoom is only part of
            // what shows. The slider shows and sets the total at the playhead (or the clip's start): the clip's zoom times
            // that effect's strength. Turning it down lowers the effect first, so 1× really is unzoomed.
            const span = positions(timeline).find(p => p.clip.id === clip.id), at = span && (time < span.start || time >= span.end) ? span.start : time;
            const held = heldZoomAt(timeline.effects, at, span ? [span.start, span.end] : undefined)?.effect, extra = held && !timeline.layerSettings?.[held.id]?.locked ? held : undefined;
            const total = clip.zoom * (extra?.amount ?? 1);
            const setTotal = (v: number) => {
              if (!extra) return updateClip({ zoom: v });
              const amount = Math.min(2.5, Math.max(1, v / clip.zoom)), zoom = Math.min(3, Math.max(1, v / amount));
              commit(patchItem(patchItem(timeline, clip.id, { zoom }), extra.id, { amount }), 'Adjust zoom');
            };
            return <><Slider label="Zoom" value={total} min={1} max={Math.max(3, total)} step={.05} format={v => `${v.toFixed(2)}×`} onChange={setTotal}/>
              {extra && <p className="tool-note">Includes the zoom effect from {extra.start.toFixed(1)}s, which stays until the next one. <button type="button" className="ebtn" onClick={() => setSelected(extra.id)}>Edit zoom effect</button></p>}</>;
          })()}<Slider label="Horizontal framing" value={clip.focusX} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateClip({ focusX: v })}/><label className="ve-checkbox"><input type="checkbox" checked={clip.fade} onChange={e => updateClip({ fade: e.target.checked })}/>Fade in and out</label>
            {assets.find(a => a.id === clip.assetId)?.kind === 'video' && clip.freeze === undefined && <><label className="ve-checkbox"><input type="checkbox" checked={!!clip.reverse} disabled={!clip.reverse && clip.out - clip.in > 15} onChange={e => updateClip({ reverse: e.target.checked || undefined })}/>Play backwards</label>
              {clip.reverse ? <p className="tool-note">The preview steps backwards without sound; the export reverses the sound too.</p> : clip.out - clip.in > 15 ? <p className="tool-note">Trim the clip to 15 seconds or less to play it backwards.</p> : null}</>}
            <div className="ve-grade"><span className="ve-grade-title">Colour</span>
              <div className="ve-grade-looks" role="group" aria-label="Colour looks"><button type="button" aria-pressed={isNeutral(clip.grade)} onClick={() => updateClip({ grade: undefined })}>Original</button>{GRADE_PRESETS.map(p => <button type="button" key={p.id} aria-pressed={JSON.stringify(clip.grade) === JSON.stringify(p.grade)} onClick={() => updateClip({ grade: p.grade })}>{p.label}</button>)}</div>
              {(['brightness', 'contrast', 'saturate'] as const).map(key => <Slider key={key} label={key === 'saturate' ? 'Saturation' : key[0].toUpperCase() + key.slice(1)} value={clip.grade?.[key] ?? 1} min={GRADE_LIMITS[key][0]} max={GRADE_LIMITS[key][1]} step={.01} format={v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`} onChange={v => updateClip({ grade: { ...NEUTRAL, ...clip.grade, [key]: v } })}/>)}
              <Slider label="Hue" value={clip.grade?.hue ?? 0} min={-180} max={180} step={1} format={v => `${Math.round(v)}°`} onChange={v => updateClip({ grade: { ...NEUTRAL, ...clip.grade, hue: v } })}/>
            </div>
            {libraryAssets.some(a => a.kind !== 'audio') && <label className="ve-field">Video on top<select className="finput" value="" title="A facecam, a split screen or a green-screen clip over this footage, from the playhead" onChange={e => { const [id, layout] = e.target.value.split('|'); if (id) addVideoOverlay(id, layout as PipLayout); }}><option value="">Add a facecam, split screen…</option>{libraryAssets.filter(a => a.kind !== 'audio').flatMap(a => [<option key={a.id} value={`${a.id}|pip`}>{a.name} · corner</option>, <option key={a.id + 's'} value={`${a.id}|${timeline.format === 'vertical' ? 'split-bottom' : 'split-right'}`}>{a.name} · {timeline.format === 'vertical' ? 'bottom half' : 'right half'}</option>])}</select></label>}
            {timeline.clips.indexOf(clip) > 0 && <div className="ve-transition">
              <label className="ve-field">Transition in<select className="finput" value={clip.transition?.kind ?? ''} onChange={e => { const kind = e.target.value as Transition['kind'] | ''; updateClip({ transition: kind ? { kind, duration: clip.transition?.duration ?? .4, ...(autoSfx ? {} : { sound: null }) } : undefined }); }}><option value="">Straight cut</option>{TRANSITIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
              {clip.transition && <><p className="tool-note">{TRANSITIONS.find(t => t.id === clip.transition!.kind)?.hint}. Played across the cut from the clip before.</p>
                <Slider label="Length" value={clip.transition.duration} min={.15} max={1.2} step={.05} format={v => `${v.toFixed(2)} s`} onChange={v => updateClip({ transition: { ...clip.transition!, duration: v } })}/>
                <SoundSelect label="Sound" value={clip.transition.sound === undefined ? TRANSITION_SOUNDS[clip.transition.kind] : clip.transition.sound ?? undefined} onChange={sound => updateClip({ transition: { ...clip.transition!, sound: sound ?? null } })}/>
                <button type="button" className="ebtn" onClick={() => { const at = positions(timeline).find(p => p.clip.id === clip.id)!.start; seek(Math.max(0, at - 1)); setPlaying(true); }}><Play size={14}/>Play the cut</button></>}
            </div>}
            <div className="ve-field-pair"><button type="button" className="ebtn" onClick={() => moveClip(-1)}><ArrowLeft size={13}/>Earlier</button><button type="button" className="ebtn" onClick={() => moveClip(1)}>Later<ArrowRight size={13}/></button></div><button type="button" className="ebtn" onClick={duplicate}><Copy size={14}/>Duplicate clip</button><button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete clip</button></fieldset>}
          {title && <fieldset className="ve-fields" disabled={locked || selectedLocked}><label className="ve-field">Text<textarea className="finput" aria-label="Title text" maxLength={160} value={title.text} onChange={e => updateTitle({ text: e.target.value })}/></label><label className="ve-field">Font<select className="finput" value={title.font} onChange={e => updateTitle({ font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label><div className="ve-field-pair"><NumberField label="Start" value={title.start} min={0} max={max} onChange={v => updateTitle({ start: v })}/><NumberField label="Duration" value={title.duration} min={.1} max={max} onChange={v => updateTitle({ duration: v })}/></div><Slider label="Size" value={title.size} min={.02} max={.18} step={.005} format={v => `${Math.round(v * 1000)}`} onChange={v => updateTitle({ size: v })}/><Slider label="Horizontal position" value={title.x} min={.1} max={.9} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateTitle({ x: v })}/><Slider label="Vertical position" value={title.y} min={.1} max={.9} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateTitle({ y: v })}/><div className="ve-field-pair"><label className="ve-field">Colour<input className="finput" type="color" value={title.color} onChange={e => updateTitle({ color: e.target.value })}/></label><label className="ve-field">Animation<select className="finput" value={title.animation} onChange={e => updateTitle({ animation: e.target.value as Title['animation'] })}>{TITLE_ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label></div><SoundSelect label="Sound as it appears" value={title.sound} onChange={sound => updateTitle({ sound })}/><TrackSelect label="Moves with" none="Stays where it is" value={title.follow} timeline={timeline} onChange={follow => updateTitle({ follow })}/><TrackSelect label="Behind" none="In front of the video" traced value={title.behind} timeline={timeline} onChange={behind => updateTitle({ behind })}/>{timeline.effects.some(e => e.kind === 'highlight') ? title.behind && <p className="tool-note">The traced object is drawn over this text, so it sits behind them.</p> : <p className="tool-note">Trace a player with a highlight (its look can be Invisible) to put this text behind them or make it move with them.</p>}<button type="button" className="ebtn" onClick={duplicate}><Copy size={14}/>Duplicate title</button><button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete title</button></fieldset>}
          {selectedCaption && <fieldset className="ve-fields" disabled={locked || selectedLocked}>
            <label className="ve-field">Caption text<textarea className="finput" maxLength={120} value={selectedCaption.text} onChange={e => updateCaption(selectedCaption.id, { text: e.target.value })}/></label>
            <label className="ve-field">Font<select className="finput" value={selectedCaption.style?.font ?? timeline.captionStyle.font} onChange={e => styleCaption(selectedCaption.id, { font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
            <div className="ve-field-pair"><label className="ve-field">Colour<input className="finput" type="color" value={selectedCaption.style?.color ?? timeline.captionStyle.color} onChange={e => styleCaption(selectedCaption.id, { color: e.target.value })}/></label><label className="ve-field">Word effect<select className="finput" value={selectedCaption.style?.active ?? timeline.captionStyle.active ?? 'none'} onChange={e => styleCaption(selectedCaption.id, { active: e.target.value as CaptionStyle['active'] })}><option value="none">None</option><option value="pop">Pop and colour</option><option value="box">Colour block</option><option value="karaoke">Karaoke</option></select></label></div>
            <label className="ve-checkbox"><input type="checkbox" checked={selectedCaption.style?.uppercase ?? timeline.captionStyle.uppercase} onChange={e => styleCaption(selectedCaption.id, { uppercase: e.target.checked })}/>Capitals</label>
            <Slider label="Size" value={selectedCaption.style?.size ?? timeline.captionStyle.size} min={.03} max={.12} step={.005} format={v => `${Math.round(v * 1000)}`} onChange={v => styleCaption(selectedCaption.id, { size: v })}/>
            <Slider label="Horizontal position" value={selectedCaption.x ?? timeline.captionStyle.x ?? .5} min={.03} max={.97} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateCaption(selectedCaption.id, { x: v })}/>
            <Slider label="Vertical position" value={selectedCaption.y ?? timeline.captionStyle.y} min={.05} max={.95} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateCaption(selectedCaption.id, { y: v })}/>
            <p className="tool-note">These controls change only this caption. Use the Captions tool to set a default look for new lines.</p>
          </fieldset>}
          {audio && pickedAsset && <fieldset className="ve-fields" disabled={locked || selectedLocked}><b className="ve-selected-name"><Music2 size={15}/>{pickedAsset.name}</b><div className="ve-field-pair"><NumberField label="Start" value={audio.start} min={0} max={max} onChange={v => updateAudio({ start: v })}/><NumberField label="Duration" value={audio.duration} min={.1} max={Math.min(max, pickedAsset.duration - audio.in)} onChange={v => updateAudio({ duration: v })}/></div><NumberField label="Source in point" value={audio.in} min={0} max={pickedAsset.duration - audio.duration} onChange={v => updateAudio({ in: v })}/><Slider label="Volume" value={audio.volume} min={0} max={1} step={.05} format={v => `${Math.round(v * 100)}%`} onChange={v => updateAudio({ volume: v })}/><label className="ve-checkbox"><input type="checkbox" checked={audio.fade} onChange={e => updateAudio({ fade: e.target.checked })}/>Fade in and out</label>
            <label className="ve-field">This is<select className="finput" value={isMusic(audio) ? 'music' : 'sfx'} onChange={e => updateAudio({ role: e.target.value as AudioClip['role'] })}><option value="music">Music</option><option value="sfx">A sound effect</option></select></label>
            {isMusic(audio) && <>
              <label className="ve-checkbox"><input type="checkbox" checked={timeline.duck !== false} onChange={e => commit({ ...timeline, duck: e.target.checked ? undefined : false }, e.target.checked ? 'Lower music under speech' : 'Keep music level')}/>Lower music while someone speaks</label>
              <div className="ve-beat-tools">
                <p className="tool-note">{musicBeats.length ? `${musicBeats.length} beats found · the yellow marks on the audio track. Cuts and effects snap to them.` : 'Finding the beat…'}</p>
                <div className="ve-field-pair"><label className="ve-field">Punch on<select className="finput" value={beatEvery} onChange={e => setBeatEvery(Number(e.target.value) as 1 | 2 | 4)}><option value={4}>Every bar</option><option value={2}>Every 2 beats</option><option value={1}>Every beat</option></select></label>
                  <button type="button" className="ebtn" disabled={!musicBeats.length} onClick={() => syncToBeat(beatEvery)}><Zap size={14}/>Sync to beat</button></div>
                <button type="button" className="ebtn w-full" disabled={!musicBeats.length || timeline.clips.length < 2} onClick={cutOnBeat}><Scissors size={14}/>Move cuts onto the beat</button>
              </div>
            </>}
            <button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete audio</button></fieldset>}
          {overlay && <fieldset className="ve-fields" disabled={locked || selectedLocked}>
            {overlay.source === 'icon' ? <label className="ve-field">Logo<select className="finput" value={overlay.icon} onChange={e => updateOverlay({ icon: e.target.value })}>{(Object.keys(ICONS) as (keyof typeof ICONS)[]).map(k => <option key={k} value={k}>{ICONS[k].label}</option>)}</select></label> : <b className="ve-selected-name">{assets.find(a => a.id === overlay.assetId)?.name}</b>}
            {overlay.source === 'icon' && <div className="ve-style-pick" role="radiogroup" aria-label="Logo style">{(['color', 'white', 'badge'] as const).map(s => <button type="button" key={s} role="radio" aria-checked={overlay.style === s} onClick={() => updateOverlay({ style: s })}><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(overlay.icon!, s))}`} alt=""/>{s === 'color' ? 'Colour' : s === 'white' ? 'White' : 'Badge'}</button>)}</div>}
            <Slider label="Size" value={overlay.size} min={.03} max={.8} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateOverlay({ size: v })}/>
            <div className="ve-field-pair"><NumberField label="Start" value={overlay.start} min={0} max={max} onChange={v => updateOverlay({ start: v })}/><NumberField label="Duration" value={overlay.duration} min={.1} max={max} onChange={v => updateOverlay({ duration: v })}/></div>
            <label className="ve-field">Animation<select className="finput" value={overlay.animation} onChange={e => updateOverlay({ animation: e.target.value as Overlay['animation'] })}><option value="fade">Fade</option><option value="none">None</option></select></label>
            <TrackSelect label="Moves with" none="Stays where it is" value={overlay.follow} timeline={timeline} onChange={follow => updateOverlay({ follow })}/>
            <p className="tool-note">Drag it on the preview to move it.</p>
            <button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete</button>
          </fieldset>}
          {videoOverlay && pickedAsset && (() => {
            const o = videoOverlay, split = o.layout.startsWith('split-'), crop = o.crop ?? { x: 0, y: 0, w: 1, h: 1 };
            // Crop by its four edges, each a share of the source; the opposite edge stays put.
            const edge = (side: 'left' | 'right' | 'top' | 'bottom', v: number) => { const c = { ...crop }; if (side === 'left') { c.w = c.x + c.w - v; c.x = v; } else if (side === 'right') c.w = 1 - v - c.x; else if (side === 'top') { c.h = c.y + c.h - v; c.y = v; } else c.h = 1 - v - c.y; updateVideoOverlay({ crop: c.x || c.y || c.w < 1 || c.h < 1 ? c : undefined }); };
            return <fieldset className="ve-fields" disabled={locked || selectedLocked}>
              <b className="ve-selected-name"><MonitorPlay size={15}/>{pickedAsset.name}</b>
              <div className="ve-pip-layouts" role="group" aria-label="Layout">{PIP_LAYOUTS.map(l => <button type="button" key={l.id} aria-pressed={o.layout === l.id} onClick={() => updateVideoOverlay({ layout: l.id, ...(l.id === 'pip' ? (split || o.layout === 'full' ? { size: .34, x: .78, y: .78 } : {}) : l.id.startsWith('split-') ? { size: Math.min(.8, Math.max(.2, split ? o.size : .5)) } : {}) })}><i className={`is-${l.id}`} aria-hidden/>{l.label}</button>)}</div>
              {o.layout !== 'full' && <Slider label={split ? 'Share of the frame' : 'Width'} value={o.size} min={split ? .2 : .05} max={split ? .8 : 1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateVideoOverlay({ size: v })}/>}
              {split && <p className="tool-note">The main footage moves into the rest of the frame while this plays.</p>}
              {pickedAsset.kind === 'video' && <><NumberField label="Source in point" value={o.in} min={0} max={Math.max(0, pickedAsset.duration - o.duration)} onChange={v => updateVideoOverlay({ in: v })}/>
                <Slider label="Volume" value={o.volume} min={0} max={1} step={.05} format={v => `${Math.round(v * 100)}%`} onChange={v => updateVideoOverlay({ volume: v })}/></>}
              <details className="ve-pip-crop" open={!!o.crop}><summary>Crop</summary>
                <Slider label="Left" value={crop.x} min={0} max={Math.min(.9, crop.x + crop.w - .05)} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => edge('left', v)}/>
                <Slider label="Right" value={1 - crop.x - crop.w} min={0} max={Math.min(.9, 1 - crop.x - .05)} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => edge('right', v)}/>
                <Slider label="Top" value={crop.y} min={0} max={Math.min(.9, crop.y + crop.h - .05)} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => edge('top', v)}/>
                <Slider label="Bottom" value={1 - crop.y - crop.h} min={0} max={Math.min(.9, 1 - crop.y - .05)} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => edge('bottom', v)}/>
              </details>
              <label className="ve-checkbox"><input type="checkbox" checked={!!o.chromaKey} onChange={e => updateVideoOverlay({ chromaKey: e.target.checked ? { color: '#00ff00', similarity: .3, blend: .1 } : undefined })}/>Remove the green screen</label>
              {o.chromaKey && <><label className="ve-field">Colour to remove<input className="finput" type="color" value={o.chromaKey.color} onChange={e => updateVideoOverlay({ chromaKey: { ...o.chromaKey!, color: e.target.value } })}/></label>
                <Slider label="Strength" value={o.chromaKey.similarity} min={.05} max={.6} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateVideoOverlay({ chromaKey: { ...o.chromaKey!, similarity: v } })}/>
                <Slider label="Soft edge" value={o.chromaKey.blend} min={0} max={.3} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateVideoOverlay({ chromaKey: { ...o.chromaKey!, blend: v } })}/></>}
              {o.layout === 'pip' && <p className="tool-note">Drag it on the preview to move it, or its corner to resize it.</p>}
              <button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete</button>
            </fieldset>;
          })()}
          {effect && <fieldset className="ve-fields" disabled={locked || selectedLocked}>
            {effect.kind === 'counter' && <>              <div className="ve-field-pair"><NumberField label="From" unit="" value={effect.from} min={-1e12} max={1e12} onChange={v => updateEffect({ from: v })}/><NumberField label="To" unit="" value={effect.to} min={-1e12} max={1e12} onChange={v => updateEffect({ to: v })}/></div>
              <div className="ve-field-pair"><label className="ve-field">Before<input className="finput" maxLength={24} value={effect.prefix} placeholder="R$ " onChange={e => updateEffect({ prefix: e.target.value })}/></label><label className="ve-field">After<input className="finput" maxLength={24} value={effect.suffix} placeholder=" ROBUX" onChange={e => updateEffect({ suffix: e.target.value })}/></label></div>
              <div className="ve-field-pair"><label className="ve-field">Numbers<select className="finput" value={effect.format} onChange={e => updateEffect({ format: e.target.value as 'full' | 'short' })}><option value="full">1,000,000</option><option value="short">1M</option></select></label><label className="ve-field">Colour<input className="finput" type="color" value={effect.color} onChange={e => updateEffect({ color: e.target.value })}/></label></div>
              <label className="ve-field">Font<select className="finput" value={effect.font} onChange={e => updateEffect({ font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
              <Slider label="Size" value={effect.size} min={.03} max={.3} step={.005} format={v => `${Math.round(v * 1000)}`} onChange={v => updateEffect({ size: v })}/>
              <Slider label="Horizontal position" value={effect.x} min={.05} max={.95} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ x: v })}/>
              <Slider label="Vertical position" value={effect.y} min={.05} max={.95} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ y: v })}/>
              <TrackSelect label="Moves with" none="Stays where it is" value={effect.follow} timeline={timeline} onChange={follow => updateEffect({ follow })}/>
<details className="ve-counter-advanced"><summary>Counting motion and formatting</summary><div className="ve-fields">
              <div className="ve-field-pair"><NumberField label="Counting delay" value={effect.countDelay ?? 0} min={0} max={max} onChange={v => updateEffect({ countDelay: v })}/><NumberField label="Counting duration" value={effect.countDuration ?? Math.max(.2, effect.duration - .45)} min={.01} max={max} onChange={v => updateEffect({ countDuration: v })}/></div>
              <EasingPicker counter value={effect.easing ?? 'easeOut'} curve={effect.curve} disabled={locked || selectedLocked} onChange={(easing, curve) => updateEffect({ easing, curve })}/>
              <div className="ve-field-pair"><NumberField label="Decimal places" unit="" value={effect.decimals ?? 0} min={0} max={4} onChange={v => updateEffect({ decimals: Math.floor(v) })}/><NumberField label="Step (0 = smooth)" unit="" value={effect.step ?? 0} min={0} max={1e12} onChange={v => updateEffect({ step: v })}/></div>
              <NumberField label="Minimum digits" unit="" value={effect.padding ?? 0} min={0} max={12} onChange={v => updateEffect({ padding: Math.floor(v) })}/>
              <label className="ve-checkbox"><input type="checkbox" checked={effect.separators !== false} onChange={e => updateEffect({ separators: e.target.checked })}/>Thousands separators</label>
              <label className="ve-checkbox"><input type="checkbox" checked={effect.entrance !== 'none'} onChange={e => updateEffect({ entrance: e.target.checked ? 'pop' : 'none' })}/>Pop entrance / exit</label>
              <label className="ve-checkbox"><input type="checkbox" checked={effect.bounce !== false} onChange={e => updateEffect({ bounce: e.target.checked })}/>Bounce at final value</label>

</div></details>
            </>}
            {effect.kind === 'zoom' && <>
              <div className="ve-field-pair"><button type="button" className="ebtn" aria-pressed={aimingZoom} onClick={() => { setPlaying(false); setAimingZoom(v => !v); }}>{aimingZoom ? 'Show result' : 'Adjust framing'}</button><button type="button" className="ebtn" onClick={() => replayZoom(effect)}><Play size={13}/>Play zoom</button></div>
              {aimingZoom && <p className="tool-note">Framing view shows the unzoomed source. Choose Show result to see the actual edit.</p>}
              <label className="ve-field">Zoom style<select className="finput" value={effect.mode ?? 'punch'} onChange={e => { const mode = e.target.value as 'punch' | 'hold'; updateEffect({ mode, rampDuration: Math.min(effect.rampDuration ?? .825, effect.duration), easing: effect.easing ?? 'easeInOut',
                // A held zoom's strength is the total it ends at. After another held zoom that total has to be above the
                // zoom already on screen, or "ease in and stay" would ease out.
                ...(mode === 'hold' && effect.amount <= zoomFrom + .001 ? { amount: Math.min(2.5, Math.round((zoomFrom + .35) * 100) / 100) } : {}) }); }}><option value="punch">Punch and return</option><option value="hold">Ease in and stay</option></select></label>
              <p className="tool-note">{effect.mode === 'hold' ? `${effect.amount < zoomFrom - .001 ? 'Zoom out' : effect.amount > zoomFrom + .001 ? 'Zoom in' : 'Keep scale and move aim'}: ${zoomFrom.toFixed(2)}× → ${effect.amount.toFixed(2)}×. Strength is the final total zoom.` : 'Punch zoom returns to the previous framing.'}</p>
              {(effect.mode !== 'hold' || effect.amount < zoomFrom - .001) && <button type="button" className="ebtn w-full" onClick={() => updateEffect({ mode: 'hold', amount: Math.min(2.5, Math.max(effect.amount, Math.round((zoomFrom + .35) * 100) / 100)), rampDuration: Math.min(effect.rampDuration ?? effect.duration, effect.duration), easing: effect.easing ?? 'easeInOut' })}>Zoom in and keep it</button>}
              {effect.mode === 'hold' && <><NumberField label="Time to reach zoom" value={effect.rampDuration ?? effect.duration} min={.01} max={effect.duration} onChange={v => updateEffect({ rampDuration: v })}/></>}
              <EasingPicker value={effect.easing ?? (effect.mode === 'hold' ? 'easeInOut' : 'easeOut')} curve={effect.curve} hold={effect.mode === 'hold'} disabled={locked || selectedLocked} onChange={(easing, curve) => updateEffect({ easing, curve })}/>
              {effect.mode !== 'hold' && <label className="ve-checkbox"><input type="checkbox" checked={effect.blur !== false} onChange={e => updateEffect({ blur: e.target.checked })}/>Motion blur while it moves</label>}
              <Slider label="Strength" value={effect.amount} min={effect.mode === 'hold' ? 1 : 1.05} max={2.5} step={.05} format={v => `${v.toFixed(2)}×`} onChange={v => updateEffect({ amount: v })}/>
              <TrackSelect label="Follow object" none="Fixed aim" value={effect.follow} timeline={timeline} traced onChange={follow => updateEffect({ follow })}/>
              {effect.follow && <p className="tool-note">The zoom follows a smoothed object track while it is visible.</p>}
              {!effect.follow && <><Slider label="Aim, left to right" value={effect.x} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ x: v })}/>
              <Slider label="Aim, top to bottom" value={effect.y} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ y: v })}/></>}
            </>}
            {effect.kind === 'shake' && <Slider label="Strength" value={effect.strength} min={.005} max={.08} step={.005} format={v => v < .02 ? 'Subtle' : v < .04 ? 'Strong' : 'Extreme'} onChange={v => updateEffect({ strength: v })}/>}
            {effect.kind === 'bar' && <>
              <div className="ve-field-pair"><NumberField label="Starts at" unit="%" value={effect.from} min={0} max={100} onChange={v => updateEffect({ from: v })}/><NumberField label="Fills to" unit="%" value={effect.to} min={0} max={100} onChange={v => updateEffect({ to: v })}/></div>
              <NumberField label="Time to fill" value={barFill(effect)} min={.05} max={effect.duration} onChange={v => updateEffect({ fill: v })}/>
              <EasingPicker counter value={effect.easing ?? 'easeOut'} disabled={locked || selectedLocked} onChange={easing => updateEffect({ easing })}/>
              <div className="ve-field-pair"><label className="ve-field">Fill<input className="finput" type="color" value={effect.color} onChange={e => updateEffect({ color: e.target.value })}/></label><label className="ve-field">Track<input className="finput" type="color" value={effect.back} onChange={e => updateEffect({ back: e.target.value })}/></label></div>
              <div className="ve-field-pair"><label className="ve-field">Label<input className="finput" maxLength={24} placeholder="XP" value={effect.label ?? ''} onChange={e => updateEffect({ label: e.target.value || undefined })}/></label><label className="ve-checkbox"><input type="checkbox" checked={!!effect.showValue} onChange={e => updateEffect({ showValue: e.target.checked || undefined })}/>Show %</label></div>
              <div className="ve-field-pair"><Slider label="Width" value={effect.w} min={.05} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ w: v })}/><Slider label="Height" value={effect.h} min={.01} max={.3} step={.005} format={v => `${Math.round(v * 1000) / 10}%`} onChange={v => updateEffect({ h: v })}/></div>
              <Slider label="Left to right" value={effect.x} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ x: v })}/>
              <Slider label="Top to bottom" value={effect.y} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ y: v })}/>
              <TrackSelect label="Moves with" none="Stays where it is" value={effect.follow} timeline={timeline} onChange={follow => updateEffect({ follow })}/>
            </>}
            {effect.kind === 'flash' && <label className="ve-field">Colour<input className="finput" type="color" value={effect.color} onChange={e => updateEffect({ color: e.target.value })}/></label>}
            {effect.kind === 'blur' && <>
              <label className="ve-field">Look<select className="finput" value={effect.style} onChange={e => updateEffect({ style: e.target.value as 'blur' | 'pixelate' })}><option value="blur">Blur</option><option value="pixelate">Pixelate</option></select></label>
              <Slider label="Strength" value={effect.strength} min={.05} max={1} step={.05} format={v => v < .4 ? 'Light' : v < .75 ? 'Medium' : 'Strong'} onChange={v => updateEffect({ strength: v })}/>
              <div className="ve-field-pair"><Slider label="Width" value={effect.w} min={.02} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ w: v })}/><Slider label="Height" value={effect.h} min={.02} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ h: v })}/></div>
              <p className="tool-note">Drag the box on the video over the username, chat or face to hide it.</p>
            </>}
            {effect.kind === 'highlight' && <>
              {picking?.id === effect.id ? <div className="ve-pick-controls">
                <div className="ve-brush-modes" role="group" aria-label="Pick tool"><button type="button" aria-pressed={!picking.remove} onClick={() => setPicking({ ...picking, remove: false })}><Plus size={15}/>Add</button><button type="button" aria-pressed={picking.remove} onClick={() => setPicking({ ...picking, remove: true })}><Eraser size={15}/>Remove</button></div>
                <p className="tool-note">Click the object on the video to pick it. Click a wrong part in Remove mode, or right-click it, to take it away. This is the first frame; tracing follows it from here.</p>
                <div className="ve-field-pair"><button type="button" className="ebtn" disabled={picking.busy || !effect.points?.length} onClick={() => void showPick({ ...effect, points: effect.points!.slice(0, -1) }, 'Undo click')}>Undo click</button><button type="button" className="ebtn" disabled={picking.busy || !effect.points?.length} onClick={() => void showPick({ ...effect, points: [] }, 'Clear clicks')}>Clear</button></div>
                <button type="button" className="ebtn w-full" disabled={picking.busy || !picking.preview || !!tracing} onClick={() => { setPicking(null); void trace([effect.id]); }}><Sparkles size={14}/>Trace with this</button>
                <button type="button" className="ebtn w-full" onClick={() => setPicking(null)}>Done</button>
              </div> : <button type="button" className="ebtn w-full" disabled={!!tracing} onClick={() => startPicking(effect)}><Sparkles size={14}/>Pick the object</button>}
              <button type="button" className="ebtn w-full" disabled={!!tracing} onClick={() => { setPlaying(false); const fps = effect.mask?.fps ?? 12; const at = Math.max(effect.start, Math.min(effect.start + effect.duration - 1 / fps, time > effect.start ? time : effect.start + .35)); setTime((effect.mask?.start ?? effect.start) + Math.floor((at - (effect.mask?.start ?? effect.start)) * fps) / fps); setBrushMode(brushMode === null ? 'erase' : null); }}>{refiningHighlight ? 'Done cleaning' : 'Brush cleanup'}</button>
              {refiningHighlight && <div className="ve-brush-controls">
                <div className="ve-brush-modes" role="group" aria-label="Highlight cleanup tool"><button type="button" aria-pressed={brushMode === 'paint'} onClick={() => setBrushMode('paint')}><Paintbrush size={15}/>Brush</button><button type="button" aria-pressed={brushMode === 'erase'} onClick={() => setBrushMode('erase')}><Eraser size={15}/>Erase</button></div>
                <Slider label="Brush size" value={brushSize} min={1} max={20} step={1} format={v => v + '%'} onChange={setBrushSize}/>
                <label className="ve-field">Apply to<select className="finput" value={brushAll ? 'all' : 'frame'} onChange={e => setBrushAll(e.target.value === 'all')}><option value="frame">Current frame</option><option value="all">Entire highlight · fixed screen area</option></select></label>
                <p className="tool-note">Drag on the video to {brushMode === 'erase' ? 'remove unwanted highlight' : 'paint missing parts'}. Each stroke has one Undo step.</p>
              </div>}
              {tracing?.id === effect.id ? <div className="ve-trace" role="status"><p className="tool-note"><Loader2 className="ve-spin" size={13}/> {tracing.note}</p><progress max={1} value={tracing.share}/><button type="button" className="ebtn" onClick={() => traceAbort.current?.abort()}>Stop tracing</button></div>
                : effect.mask ? <><p className="tool-note">Follows the object’s own shape. {(Math.abs(effect.mask.start - effect.start) > .01 || effect.mask.frames.length < Math.ceil(effect.duration * effect.mask.fps) - 1) && 'Its timing changed since it was traced, so trace it again.'}</p>
                  <button type="button" className="ebtn w-full" onClick={() => { const mask = effect.mask!; const box: [number, number, number, number] = [(effect.x - effect.w / 2) * mask.w, (effect.y - effect.h / 2) * mask.h, (effect.x + effect.w / 2) * mask.w, (effect.y + effect.h / 2) * mask.h]; updateEffect({ mask: { ...mask, frames: mask.frames.map(frame => invertMaskInBox(frame, mask.w, mask.h, box)) } }); }}>Wrong side? Select object instead</button>
                  <div className="ve-field-pair"><button type="button" className="ebtn" disabled={!!tracing} onClick={() => void trace([effect.id])}>Trace again</button><button type="button" className="ebtn" onClick={() => updateEffect({ mask: undefined })}>Use a ring</button></div></>
                : <><p className="tool-note">Put the box over the object, then trace it to colour its exact shape and follow it as it moves.</p><button type="button" className="ebtn" disabled={!!tracing} onClick={() => void trace([effect.id])}><Sparkles size={14}/>Trace the object</button></>}
              <div className="ve-field-pair"><label className="ve-field">Colour<input className="finput" type="color" value={effect.color} onChange={e => updateEffect({ color: e.target.value })}/></label>{!effect.mask && <label className="ve-field">Shape<select className="finput" value={effect.shape} onChange={e => updateEffect({ shape: e.target.value as 'ellipse' | 'box' })}><option value="ellipse">Circle</option><option value="box">Box</option></select></label>}</div>
              <label className="ve-field">Look<select className="finput" value={effect.style} onChange={e => updateEffect({ style: e.target.value as HighlightEffect['style'] })}><option value="outline">Glowing outline</option><option value="tint">{effect.mask ? 'Coloured in' : 'Colour wash'}</option><option value="spotlight">Spotlight (darken the rest)</option><option value="sticker">Sticker (white border)</option><option value="none">Invisible (only for tracking)</option></select></label>
              <label className="ve-field">Object effect<select className="finput" value={effect.look ?? 'none'} onChange={e => updateEffect({ look: e.target.value === 'none' ? undefined : e.target.value as HighlightEffect['look'] })}><option value="none">None</option><option value="flash">Flash on the object</option><option value="cycle">Change its colour</option><option value="sweep">Repeating light sweep</option></select></label>
              {effect.look === 'flash' && <div className="ve-field-pair"><label className="ve-field">Flash colour<input className="finput" type="color" value={effect.lookColor ?? '#ffffff'} onChange={e => updateEffect({ lookColor: e.target.value })}/></label><NumberField label="Flash length" value={effect.lookDuration ?? .2} min={.05} max={effect.duration} onChange={v => updateEffect({ lookDuration: v })}/></div>}
              {effect.look === 'cycle' && <div className="ve-field-pair"><label className="ve-field">Changes to<input className="finput" type="color" value={effect.endColor ?? '#ffbf47'} onChange={e => updateEffect({ endColor: e.target.value })}/></label><NumberField label="Change after" value={effect.changeAt ?? 1} min={0} max={effect.duration} onChange={v => updateEffect({ changeAt: v })}/></div>}
              {effect.look === 'sweep' && <NumberField label="Repeat every" value={effect.every ?? 1} min={.2} max={10} onChange={v => updateEffect({ every: v })}/>}
              {effect.style === 'none' && <p className="tool-note">Shows nothing itself: titles, logos and bars can move with it or sit behind the object it traces.</p>}
              <div className="ve-field-pair"><label className="ve-field">Appear<select className="finput" value={effect.reveal ?? 'pop'} onChange={e => updateEffect({ reveal: e.target.value as HighlightEffect['reveal'] })}><option value="pop">Pop in</option><option value="draw">Draw the outline</option><option value="fade">Colour sweeps in</option></select></label>
                <label className="ve-checkbox"><input type="checkbox" checked={!!effect.pulse} onChange={e => updateEffect({ pulse: e.target.checked })}/>Pulsing glow</label></div>
              <label className="ve-field">Label<input className="finput" maxLength={40} placeholder="e.g. RARE PIANO" value={effect.label ?? ''} onChange={e => updateEffect({ label: e.target.value || undefined })}/></label>
              <Slider label="Left to right" value={effect.x} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ x: v })}/>
              <Slider label="Top to bottom" value={effect.y} min={0} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ y: v })}/>
              <Slider label="Width" value={effect.w} min={.02} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ w: v })}/>
              <Slider label="Height" value={effect.h} min={.02} max={1} step={.01} format={v => `${Math.round(v * 100)}%`} onChange={v => updateEffect({ h: v })}/>
            </>}
            <div className="ve-field-pair"><NumberField label="Start" value={effect.start} min={0} max={max} onChange={v => updateEffect({ start: v })}/><NumberField label="Length" value={effect.duration} min={.1} max={effect.kind === 'counter' || effect.kind === 'zoom' && effect.mode === 'hold' ? max : 30} onChange={v => updateEffect({ duration: v, ...(effect.kind === 'zoom' && effect.mode === 'hold' ? { rampDuration: Math.min(effect.rampDuration ?? v, v) } : {}) })}/></div>
            <SoundSelect label={effect.kind === 'counter' ? 'Sound when it lands' : 'Sound'} value={effect.sound} onChange={sound => updateEffect({ sound })}/>
            <button type="button" className="ebtn" onClick={() => { seek(effect.start); setPlaying(true); }}><Play size={14}/>Play it</button>
            {timeline.clips.length > 1 && <details className="ve-copy-clips"><summary>Use on other clips</summary>
              <p className="tool-note">Adds a copy at the same moment in each clip you pick.</p>
              <label className="ve-checkbox"><input type="checkbox" checked={copyTargets.length >= timeline.clips.length - 1} onChange={e => setCopyTargets(e.target.checked ? timeline.clips.map(c => c.id) : [])}/>All clips</label>
              {positions(timeline).filter(p => !(effect.start >= p.start && effect.start < p.end)).map(p => { const n = timeline.clips.indexOf(p.clip) + 1; return <label key={p.clip.id} className="ve-checkbox"><input type="checkbox" checked={copyTargets.includes(p.clip.id)} onChange={e => setCopyTargets(t => e.target.checked ? [...t, p.clip.id] : t.filter(i => i !== p.clip.id))}/>{String(n).padStart(2, '0')} · {assets.find(a => a.id === p.clip.assetId)?.name ?? 'Clip'}</label>; })}
              <button type="button" className="ebtn w-full" disabled={!copyTargets.length} onClick={() => copyToClips(effect, copyTargets)}><Copy size={14}/>Add to {copyTargets.filter(id => !positions(timeline).some(p => p.clip.id === id && effect.start >= p.start && effect.start < p.end)).length || ''} clips</button>
            </details>}
            <button type="button" className="ebtn" onClick={() => savePreset(effect)}><Plus size={14}/>Save as my preset</button>
            <button type="button" className="ebtn" onClick={removeSelected}><Trash2 size={14}/>Delete</button>
          </fieldset>}
          {!selectedLayer && <p className="tool-note">Select a clip or layer on the timeline to adjust it. Describe additions or changes in the Bopzi AI prompt.</p>}
        </>}
      </div>
    </aside>)}

    <main className="studio-main" aria-busy={locked} inert={modalReview}>
      <div className={'studio-canvas ve-stage' + (review?.source === 'ai' ? ' is-review' : '')} ref={stage}>
        {total > 0 ? <div className={`ve-preview-frame is-${previewTimeline.format}${aiBusy ? ' is-ai-thinking' : previewGlowComplete ? ' is-ai-complete' : ''}`}>
        <div className="ve-artboard artboard-shadow" onPointerDown={pressStage} inert={review?.source === 'ai'}><Preview ref={preview} timeline={!review && refiningHighlight ? { ...canvasTimeline, clips: canvasTimeline.clips.map(c => ({ ...c, fade: false })) } : canvasTimeline} assets={assets} time={time} playing={playing} onTime={setTime} onEnd={() => setPlaying(false)} muted={muted} quality={quality} proxies={useProxies} loop={loop ?? undefined} steady={!review && aiming}/><AiTargetHints targets={aiAimed} canvas={() => preview.current?.canvas() ?? null}/>
          {picking && effect?.kind === 'highlight' && effect.id === picking.id && <div className={`ve-pick${picking.remove ? ' is-remove' : ''}${picking.busy ? ' is-busy' : ''}`} role="application" aria-label={picking.remove ? 'Click parts to remove from the object' : 'Click the object to add it'} onPointerDown={clickPick} onContextMenu={e => e.preventDefault()}>
            {picking.preview && <img src={picking.preview} alt=""/>}
            {(effect.points ?? []).map((p, i) => <i key={i} className={p.label ? 'is-add' : 'is-remove'} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>{p.label ? '+' : '−'}</i>)}
            {picking.busy && <span className="ve-pick-busy"><Loader2 className="ve-spin" size={14}/>Finding the object…</span>}
          </div>}
          {refiningHighlight && <button type="button" className={'ve-highlight-brush is-' + brushMode} aria-label={brushMode === 'paint' ? 'Paint highlight on video' : 'Erase highlight on video'} disabled={!!tracing || selectedLocked} onPointerDown={paintHighlight} onPointerMove={e => { const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--brush-x', (e.clientX - rect.left) + 'px'); e.currentTarget.style.setProperty('--brush-y', (e.clientY - rect.top) + 'px'); }}><span style={{ width: brushSize + '%' }} aria-hidden/></button>}
          {aiming && zoomEffect && zoomBox && <>
            {/* Anywhere on the frame: press to aim there. */}
            {!selectedLocked && <div className={`ve-zoom-aim${selectingZoomTarget ? ' is-selecting' : ''}`} onPointerDown={selectingZoomTarget ? drawZoomTarget : aimZoom('frame')} aria-hidden={!selectingZoomTarget || undefined}/>}
            <div className={`ve-zoom-box${selectedLocked ? ' is-locked' : ''}${selectingZoomTarget ? ' is-selecting' : ''}`} style={{ left: `${zoomBox.x * 100}%`, top: `${zoomBox.y * 100}%`, width: `${zoomBox.size * 100}%`, height: `${zoomBox.size * 100}%` }} title="Drag to move the crop" onPointerDown={aimZoom('move')}>
              <b>{zoomEffect.amount.toFixed(2)}× · crop</b>
              <button type="button" className="ve-zoom-target" aria-label="Zoom target. Drag to move or use arrow keys to adjust" title="Zoom target · drag or use arrow keys" onPointerDown={aimZoom('target')} onKeyDown={e => {
                const step = e.shiftKey ? .04 : .01, dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                if (!dx && !dy) return; e.preventDefault(); setZoomTargetBox(null);
                changeZoom(zoomAt(zoomBox.x + zoomBox.size / 2 + dx, zoomBox.y + zoomBox.size / 2 + dy, zoomEffect.amount), 'Aim zoom');
              }}><span className="ve-zoom-target-dot" aria-hidden="true"/></button>
              {!selectedLocked && (['tl', 'tr', 'bl', 'br'] as const).map(c => <span key={c} className={`ve-zoom-corner is-${c}`} title="Drag to zoom more or less" onPointerDown={aimZoom('corner')}/>)}
            </div>
            {zoomTargetBox && zoomTargetBox.w > .015 && zoomTargetBox.h > .015 && <div className="ve-zoom-selected-target" style={{ left: `${zoomTargetBox.x * 100}%`, top: `${zoomTargetBox.y * 100}%`, width: `${zoomTargetBox.w * 100}%`, height: `${zoomTargetBox.h * 100}%` }}><b>Subject</b></div>}
            <div className="ve-zoom-tools" onPointerDown={e => e.stopPropagation()}>
              <span>{selectedLocked ? 'This zoom is locked' : selectingZoomTarget ? 'Drag a box around the subject' : 'Click a subject or drag the target marker · crop corners change zoom'}</span>
              {[1.2, 1.5, 2].map(a => <button type="button" key={a} disabled={selectedLocked} aria-pressed={Math.abs(zoomEffect.amount - a) < .01} onClick={() => changeZoom(zoomAt(zoomBox.x + zoomBox.size / 2, zoomBox.y + zoomBox.size / 2, a), 'Set zoom strength')}>{a}×</button>)}
              <button type="button" disabled={selectedLocked} aria-pressed={selectingZoomTarget} onClick={() => { setZoomTargetBox(null); setSelectingZoomTarget(v => !v); }}>Select subject</button>
              <button type="button" onClick={() => replayZoom(zoomEffect)}><Play size={12}/>Play zoom</button>
              <button type="button" onClick={() => setAimingZoom(false)}>Show result</button>
            </div>
          </>}
          {selectedBox && <div className="ve-on-video" style={pct(selectedBox)}>{!selectedLocked && <button type="button" className="ve-resize-handle" aria-label="Resize selected layer" onPointerDown={resizeStage}/>}</div>}
          {editing && editingBox && editingItem && <textarea className="ve-inline-text" autoFocus rows={1} aria-label="Edit text. Press Shift and Enter for a new line; Enter to save" value={editing.text} maxLength={160} style={{ left: `${(editingBox.x + editingBox.w / 2) / frameW * 100}%`, top: `${(editingBox.y + editingBox.h / 2) / frameH * 100}%`, minWidth: `${editingBox.w / frameW * 100}%`, fontFamily: face(editingItem.font).family, fontWeight: Number(face(editingItem.font).weight), color: editingItem.color, fontSize: `${editingItem.size * 100}cqh` }} onChange={e => setEditing({ ...editing, text: e.target.value })} onBlur={() => finishEditing(true)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishEditing(true); } if (e.key === 'Escape') finishEditing(false); }}/>} 
        </div>
        <div className="ve-player-controls" aria-label="Playback controls. Drag the background to move" style={playerControlsPosition ? { left: `${playerControlsPosition.x * 100}%`, top: `${playerControlsPosition.y * 100}%`, bottom: 'auto', transform: 'translate(-50%, -50%)' } : undefined} onPointerDown={startPlayerControlsDrag} onPointerMove={movePlayerControls} onPointerUp={endPlayerControlsDrag} onPointerCancel={endPlayerControlsDrag}><button type="button" className="ve-play" aria-label={playing ? 'Pause' : 'Play'} disabled={!previewLength || locked} onClick={togglePlay}>{playing ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}</button><span className="ve-time"><b>{clock(time).slice(0, 8)}</b><i>/ {clock(previewLength).slice(0, 8)}</i></span><IconBtn tip={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={() => setMuted(v => !v)}>{muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}</IconBtn><IconBtn tip="Full screen" disabled={!previewLength} onClick={() => { void stage.current?.requestFullscreen().catch(() => setNotice('Full screen is not available in this browser.')); }}><Maximize2 size={14}/></IconBtn></div>
        </div>
          : <div className="ve-welcome"><span className="ve-welcome-icon"><modeText.icon size={22}/></span><p>{modeText.headline}</p><span>{modeText.body}</span><ol className="ve-welcome-steps"><li><b>1</b><span>Add gameplay clips or screenshots</span></li><li><b>2</b><span>Tell Bopzi what you want to make</span></li><li><b>3</b><span>Review your cut, then export</span></li></ol><div><button type="button" className="ebtn go" disabled={locked} onClick={() => void chooseMedia()}><Plus size={15}/>Add gameplay</button><button type="button" className="ve-link" disabled={locked} onClick={() => void loadDemo()}>Explore a sample</button></div><small className="ve-welcome-note">Footage stays where it is on your computer. Any length, any size.</small></div>}
        {(loading || busy || exporting) && <div className="ve-working" role="status"><Loader2 className="ve-spin" size={22}/><b>{exporting ? exportStage?.label ?? 'Rendering your MP4' : busy || 'Opening your project'}</b>{exporting && exportStage ? <><progress className="ve-export-progress" max={1} value={exportStage.share} aria-label="Export progress"/><p>{Math.round(exportStage.share * 100)}% · saved to Videos\Bopzi when done</p></> : <p>{busy.startsWith('Choose files') ? 'The file picker may open behind this window.' : 'Just a moment…'}</p>}{exporting && <button type="button" onClick={() => exportAbort.current?.abort()}>Cancel export</button>}</div>}
      </div>
      {/* One dock: playback on the left, the edit you want on the right. */}
      <div className="ve-dock-zone">
        {makingPreviews.length > 0 && !aiBusy && !change && !aiNote && <div className="ve-change is-note ve-understanding" role="status" title="A lightweight copy for smooth scrubbing. Your original file is untouched and is what export uses."><Loader2 size={13} className="ve-spin" aria-hidden/><span className="ve-change-text">Making preview copy<i> · {makingPreviews[0].name}{makingPreviews.length > 1 ? ` and ${makingPreviews.length - 1} more` : ''}</i></span><span className="ve-change-note">{makingPreviews[0].disk!.preview!.percent}%</span></div>}
        {understanding && !aiBusy && !change && !aiNote && <div className="ve-change is-note ve-understanding" role="status" title="Bopzi learns each video once, on this computer, so edits can find moments, speakers and people."><Loader2 size={13} className="ve-spin" aria-hidden/><span className="ve-change-text">{understanding.stage}<i> · {understanding.name}</i></span><span className="ve-change-note">{Math.max(0, Math.min(100, Math.round(understanding.percent)))}%</span></div>}
        {aiNote && !change && !aiBusy && <div className="ve-change is-note" role="status"><Info size={14} aria-hidden/><span className="ve-change-text" title={aiNote}>{aiNote}</span><button type="button" className="ve-change-close" aria-label="Dismiss" onClick={() => setAiNote('')}><X size={14}/></button></div>}
        {change && !aiBusy && <div className={`ve-change${change.check?.problems.length ? ' has-problems' : ''}${changeFolded && !change.check?.problems.length ? ' is-folded' : ''}`} role="status" onMouseEnter={() => setChangeFolded(false)}>
          {change.check?.problems.length ? <AlertTriangle size={14} aria-hidden/> : <Check size={14} aria-hidden/>}
          <button type="button" className="ve-change-summary" title={change.summary} onClick={() => { const id = [...change.ids][0], item = id && items(timeline, assets).find(i => i.id === id); if (item) { showItem(item.id); seek(item.start + Math.min(.35, item.duration / 2)); } }}>{change.check?.problems.length ? change.check.problems[0].problem : change.summary}</button>
          {change.check?.state === 'checking' && <span className="ve-change-note"><Loader2 size={12} className="ve-spin"/>Checking</span>}
          {change.check?.problems.length && change.proposal ? <button type="button" onClick={() => void ask({ fix: { ...change.proposal!, check: change.check } })}>Fix</button> : null}
          <button type="button" title="Undo this edit (Ctrl+Z)" onClick={undoAiEdit}>Undo<kbd>Ctrl Z</kbd></button>
          <button type="button" className="ve-change-close" aria-label="Dismiss" onClick={() => setChange(null)}><X size={14}/></button>
        </div>}
        <AiComposer command={command} target={selectedLayer} effectKind={effect?.kind} busy={aiBusy} disabled={locked} status={status} completionSignal={aiCompletion} onCommand={setCommand} onSubmit={() => void ask()} onCancel={() => aiAbort.current?.abort()} onClearTarget={() => { setSelected(null); setAiScope('project'); }} onUpload={files => void upload(files)} onPick={() => void chooseMedia()} onPaths={paths => void addFromPaths(paths)} question={aiQuestion} onChoice={choice => void ask({ text: choice })} onDismissQuestion={() => setAiQuestion(null)} styleReference={aiStyleReference} onStyleReference={value => { setAiStyleReference(value); saveStyleReference(value); }} styleProfile={aiStyle} onStyleProfile={value => { setAiStyle(value); saveStyleProfile(value); }}/>
      </div>
      <section className={`ve-timeline${tracks ? ' is-expanded' : ''}`} aria-label="Video timeline" inert={!!review}>
        {/* The editing toolbar, CapCut style: history and cut tools on the left, view tools on the right. */}
        <header className="ve-timeline-toolbar">
          <IconBtn tip="Undo  (Ctrl Z)" side="top" disabled={!past.length || locked} onClick={undo}><Undo2 size={15}/></IconBtn>
          <IconBtn tip="Redo  (Ctrl Shift Z)" side="top" disabled={!future.length || locked} onClick={redo}><Redo2 size={15}/></IconBtn>
          <i className="ve-toolbar-line" aria-hidden/>
          <IconBtn tip="Split at the playhead  (S)" side="top" disabled={locked || !total} onClick={split}><Scissors size={15}/></IconBtn>
          <IconBtn tip="Copy selected text or zoom  (Ctrl/⌘C)" side="top" disabled={!canCopyTimelineSelection} onClick={copyTimelineSelection}><Copy size={15}/></IconBtn>
          <IconBtn tip="Paste at the playhead  (Ctrl/⌘V)" side="top" disabled={locked || !hasTimelineClipboard} onClick={pasteTimelineSelection}><ClipboardPaste size={15}/></IconBtn>
          <IconBtn tip="Duplicate selected item  (Ctrl/⌘D)" side="top" disabled={locked || !selected || selectedLocked} onClick={duplicate}><Copy size={15}/></IconBtn>
          <IconBtn tip={selectedIds.length > 1 ? `Delete ${selectedIds.length} selected items  (Del)` : 'Delete  (Del)'} side="top" disabled={locked || !selected || selectionLocked} onClick={removeSelected}><Trash2 size={15}/></IconBtn>
          <i className="ve-toolbar-line" aria-hidden/>
          <button type="button" className="ve-magnet" aria-pressed={magnet} title={magnet ? 'Snapping to cuts and beats is on. Hold Alt while dragging to skip it.' : 'Snapping is off'} onClick={toggleMagnet}><Magnet size={13}/><span>Snap</span></button>
          <span className="ve-timeline-caption" title="Ctrl/⌘-click to add or remove items · Shift-click to select a range · Delete to remove">{selectedIds.length > 1 ? `${selectedIds.length} selected · Delete to remove` : `${timeline.clips.length} clip${timeline.clips.length === 1 ? '' : 's'} · ${total.toFixed(1)}s${musicBeats.length ? ` · ${musicBeats.length} beats` : ''}`}</span>
          <span className="flex-1"/>
          <div className="ve-view-tabs" role="tablist" aria-label="Timeline view">{([['timeline', 'Timeline'], ['transcript', 'Transcript'], ['moments', 'Moments']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{label}{id === 'moments' && understanding && <Loader2 size={11} className="ve-spin" aria-label="still analysing"/>}</button>)}</div>
          {view === 'timeline' && tracks && <><IconBtn tip="Zoom out" disabled={zoom <= 3} onClick={() => setZoom(v => Math.max(3, v - 8))}><ZoomOut size={14}/></IconBtn><input aria-label="Timeline zoom" type="range" min={3} max={90} value={zoom} onChange={e => setZoom(Number(e.target.value))}/><IconBtn tip="Zoom in" disabled={zoom >= 90} onClick={() => setZoom(v => Math.min(90, v + 8))}><ZoomIn size={14}/></IconBtn></>}{view === 'timeline' && <button type="button" className="ve-tracks-toggle" aria-expanded={tracks} onClick={() => setTracks(v => !v)}>{tracks ? 'Story view' : 'Show all tracks'}<ChevronDown size={13}/></button>}</header>
        {view === 'transcript' && <TranscriptPanel words={words} time={time} disabled={locked} analysing={!!understanding} pauses={pauses} onSeek={t => seek(Math.max(0, t))} onCut={cutText} onFixWord={(w, text) => void fixTranscriptWord(w, text)} onNameSpeaker={(id, s, name) => void renameSpeaker(id, s, name)} captions={{ count: timeline.captions.length, style: timeline.captionStyle, busy: captioning, onMake: () => void autoCaptions(), onStyle: styleCaptions }}/>}
        {view === 'moments' && <MomentsPanel indexes={indexes} assets={libraryAssets} mode={timeline.mode} disabled={locked} analysing={!!understanding} onUse={m => takeMoment(m, false)} onAdd={m => takeMoment(m, true)}/>}
        <div className={locked ? 've-timeline-locked' : ''} hidden={view !== 'timeline'}><TimelineTracks insights={insights} compact={!tracks} changed={change?.ids ?? new Set()} leaving={leaving} clipBar={tracks && clip && selectedIds.length < 2 && <>
          <IconBtn tip="Split at the playhead  (S)" side="top" onClick={split}><Scissors size={14}/></IconBtn>
          <button type="button" className="ve-bar-speed" title="Speed" onClick={cycleSpeed}>{clip.speed}×</button>
          <IconBtn tip={clip.volume ? 'Mute this clip' : 'Unmute this clip'} side="top" onClick={() => updateClip({ volume: clip.volume ? 0 : 1 })}>{clip.volume ? <Volume2 size={14}/> : <VolumeX size={14}/>}</IconBtn>
          <IconBtn tip="Duplicate  (Ctrl/⌘D)" side="top" onClick={duplicate}><Copy size={14}/></IconBtn>
          <IconBtn tip="More settings" side="top" onClick={() => openInspector()}><SlidersHorizontal size={14}/></IconBtn>
          <button type="button" className="ve-delete-clip" disabled={selectedLocked || locked} onClick={removeSelected}><Trash2 size={13}/><span>Delete clip</span></button>
        </>} timeline={previewTimeline} assets={assets} time={time} selected={selected} selectedIds={selectedIds} zoom={zoom} magnet={magnet} beats={musicBeats} onSeek={seek} onSelect={selectTimelineItem} onReorder={reorder} onToggleCompound={id => { commit({ ...timeline, compounds: timeline.compounds?.map(g => g.id === id ? { ...g, collapsed: false } : g) }, 'Expand compound'); }} onAdd={addAsset} onTrim={(id, start, end) => { if (!locked && !timeline.layerSettings?.[id]?.locked) commit({ ...timeline, clips: timeline.clips.map(c => c.id === id ? { ...c, in: start, out: end } : c) }, 'Trim clip'); }} onRetime={(id, patch, label) => { if (!locked) { setSelected(id); commit(patchItem(timeline, id, { ...patch, ...(patch.start !== undefined ? { start: Math.min(max, patch.start) } : {}) }), label); } }}/></div>
      </section>
    </main>

    {review && modalReview && <EditReview proposal={review} assets={assets} at={time} onClose={review.source === 'ai' ? () => setReviewModal(false) : undefined} onAccept={acceptReview} onReject={() => { setReview(null); setNotice('Proposal discarded. Your edit is unchanged.'); }}/> }
    {notice && <div role="status" aria-live="polite" className="toast"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {exported && !notice && <div role="status" aria-live="polite" className="toast ve-exported"><Check size={15}/><span>Saved <b title={exported.file}>{exported.name}</b> to Videos\Bopzi</span><button type="button" className="ve-exported-show" onClick={() => void revealExport(exported.file)}>Show in folder</button><button type="button" aria-label="Dismiss notification" onClick={() => setExported(null)}>×</button></div>}
    {historyOpen && <div className="ve-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setHistoryOpen(false); }}><div className="ve-modal" ref={modal} role="dialog" aria-modal="true" aria-label="Earlier cuts"><header><h2>Earlier cuts</h2><button type="button" autoFocus className="ibtn" aria-label="Close" onClick={() => setHistoryOpen(false)}><X size={18}/></button></header><p>Restore an earlier cut. Undo brings you back. Your last 40 edits are saved with this project.</p><div className="ve-modal-list">{[...past].reverse().map((revision, i) => <button type="button" key={`${revision.at}-${i}`} disabled={locked} onClick={() => { commit(revision.timeline, 'Restore earlier cut'); setHistoryOpen(false); }}><History size={16}/><span><b>Before: {revision.label}</b><small>{duration(revision.timeline).toFixed(1)}s · {revision.timeline.clips.length} clips</small></span><ArrowRight size={15}/></button>)}{!past.length && <p>Your edits will appear here.</p>}</div></div></div>}
    <input hidden ref={file} type="file" multiple accept={tool === 'audio' ? 'audio/*' : 'video/*,image/*,audio/*'} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void upload(files); }}/>
  </div>;
}
/**
 * What the inspector shows when nothing is selected: the project at a glance and the next useful steps, instead of an
 * empty "select something" panel. Every row either says what the cut has or offers the one action that adds it.
 */
function ProjectPanel({ timeline, total, beats, locked, captioning, exporting, onCaptions, onCaptionLook, onAddText, onAddEffect, onMusic, onDuck, onSync, onExport }: { timeline: Timeline; total: number; beats: number; locked: boolean; captioning: boolean; exporting: boolean; onCaptions: () => void; onCaptionLook: () => void; onAddText: () => void; onAddEffect: () => void; onMusic: () => void; onDuck: (on: boolean) => void; onSync: () => void; onExport: () => void }) {
  const music = timeline.audio.filter(isMusic), max = MODES[timeline.mode].max, fmt = { landscape: '16:9', vertical: '9:16', square: '1:1' }[timeline.format];
  const row = (icon: React.ReactNode, label: string, value: string, action?: React.ReactNode) => <div className="ve-project-row">{icon}<span><b>{label}</b><small>{value}</small></span>{action}</div>;
  return <div className="ve-project">
    <div className="ve-project-stats">
      <div><b>{clock(total).slice(0, 5)}</b><small>of {Math.round(max / 60) >= 1 ? `${Math.round(max / 60)} min` : `${max}s`}</small></div>
      <div><b>{timeline.clips.length}</b><small>clips</small></div>
      <div><b>{timeline.effects.length}</b><small>effects</small></div>
      <div><b>{fmt}</b><small>{MODES[timeline.mode].label}</small></div>
    </div>
    <div className="ve-project-meter" aria-hidden><i style={{ width: `${Math.min(100, total / max * 100)}%` }}/></div>
    {row(<Captions size={16}/>, 'Captions', timeline.captions.length ? `${timeline.captions.length} lines · ${CAPTION_PRESETS.find(p => p.id === timeline.captionStyle.preset)?.label ?? 'custom look'}` : 'None yet',
      timeline.captions.length ? <button type="button" className="ebtn" disabled={locked} onClick={onCaptionLook}>Style</button> : <button type="button" className="ebtn" disabled={locked || !total || captioning} onClick={onCaptions}>{captioning ? <Loader2 className="ve-spin" size={13}/> : null}Make</button>)}
    {row(<Music2 size={16}/>, 'Music', music.length ? `${music.length} track${music.length > 1 ? 's' : ''}${beats ? ` · ${beats} beats` : ''}` : 'None yet',
      music.length ? beats ? <button type="button" className="ebtn" disabled={locked} onClick={onSync} title="A zoom punch on every bar">Sync</button> : null : <button type="button" className="ebtn" disabled={locked} onClick={onMusic}>Add</button>)}
    {music.length > 0 && <label className="ve-checkbox ve-project-sub"><input type="checkbox" checked={timeline.duck !== false} disabled={locked} onChange={e => onDuck(e.target.checked)}/>Lower music while someone speaks</label>}
    {row(<Type size={16}/>, 'Titles', timeline.titles.length ? `${timeline.titles.length} on screen` : 'None yet', <button type="button" className="ebtn" disabled={locked || !total} onClick={onAddText}>Add</button>)}
    {row(<Zap size={16}/>, 'Effects', timeline.effects.length ? `${timeline.effects.length} · zooms, shakes, counters…` : 'None yet', <button type="button" className="ebtn" disabled={locked || !total} onClick={onAddEffect}>Add</button>)}
    <button type="button" className="ebtn go w-full" disabled={!total || locked} onClick={onExport}>{exporting ? <i className="spinner"/> : <Download size={15}/>}{exporting ? 'Exporting…' : 'Export MP4'}</button>
    <p className="tool-note ve-shortcuts"><kbd>Space</kbd> play <kbd>S</kbd> split <kbd>Del</kbd> delete <kbd>Ctrl Z</kbd> undo <kbd>Alt</kbd> drag without snapping</p>
  </div>;
}
function NumberField({ label, value, min, max, onChange, unit = 's' }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void; unit?: string }) { const [draft, setDraft] = useState(String(Number(value.toFixed(4)))); useEffect(() => setDraft(String(Number(value.toFixed(4)))), [value]); return <label className="ve-field">{label}<div className="ve-number"><input className="finput" type="number" aria-label={label} step="0.1" min={min} max={max} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { const n = Number(draft); if (draft && Number.isFinite(n) && max >= min) onChange(Math.min(max, Math.max(min, n))); else setDraft(String(Number(value.toFixed(4)))); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>{unit && <span>{unit}</span>}</div></label>; }
function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) { return <label className="ve-slider"><span>{label}<b>{format(value)}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
/** Picks a highlight to move with or go behind; `traced` lists only highlights that follow an object's shape. */
function TrackSelect({ label, none, value, timeline, traced = false, onChange }: { label: string; none: string; value?: string; timeline: Timeline; traced?: boolean; onChange: (id: string | undefined) => void }) {
  const marks = timeline.effects.filter((e): e is HighlightEffect => e.kind === 'highlight' && (!traced || !!e.mask || e.id === value));
  if (!marks.length) return null;
  return <label className="ve-field">{label}<select className="finput" value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}><option value="">{none}</option>{marks.map(e => <option key={e.id} value={e.id}>{timeline.layerSettings?.[e.id]?.name || e.label || 'Highlight'} · {e.start.toFixed(1)}s{e.mask ? '' : ' (not traced)'}</option>)}</select></label>;
}
