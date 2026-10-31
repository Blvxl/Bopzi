import { isEasing, validateBezier, type Easing } from './easing';
import type { LayerSettings } from './editing';
import { EFFECT_KINDS, easeOutBack, type Effect, type HighlightMask, type TitleMotion } from './motion';
import { findSound } from './sounds';
import { TRANSITION_KINDS, type Transition } from './transitions';
import { motionLength, sliceMotion, validateKeyframes, validateSpeedPoints, type Keyframe, type SpeedPoint } from './clip-motion';
import type { Compound, NamedCut } from './workflow';
import { validateGrade, type Grade } from './grade';
import { PIP_LAYOUTS, type VideoOverlay } from './pip';
export type MediaKind ='video' | 'image' | 'audio';
export type MediaInfo = { id: string; name: string; kind: MediaKind; duration: number; width: number; height: number; poster?: string };
/**
 * Media kept in the browser has its bytes in `blob`. Media on disk (`disk`) stays where it is on this computer: the
 * browser plays the server's preview copy at `url`, and export reads the original (library.ts).
 */
export type Media = MediaInfo & { blob?: Blob; url: string; proxyBlob?: Blob; proxyUrl?: string; disk?: DiskMedia };
export type DiskMedia = { id: string; path: string; preview?: { ready: boolean; percent: number; error?: string } };
/** `transition` is how this clip comes in from the one before it, played across the cut (transitions.ts). */
export type Clip = { id: string; assetId: string; in: number; out: number; speed: number; volume: number; zoom: number; focusX: number; fade: boolean; transition?: Transition; keyframes?: Keyframe[]; speedPoints?: SpeedPoint[]; freeze?: number; hold?: number; /** Colour correction (grade.ts). */ grade?: Grade; /** Plays the trimmed range backwards, sound included. */ reverse?: boolean };
export type TitleAnimation = 'fade' | 'pop' | 'none' | 'typewriter' | 'slide' | 'bounce' | 'shake' | 'glitch';
/** `sound` is a built-in sound effect (sounds.ts) played as the title appears. */
/** `accent`: the colour of *starred* words in the text. */
/**
 * `follow`: a highlight whose traced object it moves with; x and y are where it sits at its own start (follow.ts).
 * `behind`: a traced highlight whose object is drawn over the title, so the text sits behind the player (layers.ts).
 */
export type Title = { id: string; text: string; start: number; duration: number; x: number; y: number; size: number; color: string; font: string; animation: TitleAnimation; sound?: string; accent?: string; follow?: string; behind?: string };
/** One spoken phrase on screen. Its look comes from the timeline's caption style, so every caption matches. */
export type Caption = { id: string; text: string; start: number; duration: number; /** This line's own position; unset captions use the shared caption defaults. */ x?: number; y?: number; /** Optional styling for this line, layered over the shared caption look. */ style?: CaptionStyleOverride; /** When each word is said, in seconds from the caption's start. */ words?: CaptionWord[] };
export type CaptionWord = { start: number; end: number };
/**
 * `active` is how the word being said stands out, CapCut style: "pop" springs it up in the highlight colour, "box" puts
 * it on a rounded block of that colour, "karaoke" keeps every word already said in that colour, "none" keeps the whole
 * line plain. `stroke` scales the black outline (1 is normal), `glow` is a neon halo colour, `shadow` a drop shadow.
 * `preset` only remembers which caption look was picked last (CAPTION_PRESETS).
 */
export type CaptionStyle = { font: string; color: string; size: number; x: number; y: number; uppercase: boolean; active?: 'pop' | 'box' | 'karaoke' | 'none'; activeColor?: string; stroke?: number; glow?: string; shadow?: boolean; preset?: string; /** An emoji after a caption whose words call for one (money 💰, win 🏆…). */ emoji?: boolean };
export type CaptionStyleOverride = Partial<Pick<CaptionStyle, 'font' | 'color' | 'size' | 'uppercase' | 'active' | 'activeColor' | 'stroke' | 'glow' | 'shadow' | 'emoji'>>;
/** Caption looks in one click, after the styles creators copy: chunky MrBeast captions, neon gaming text, karaoke. */
export const CAPTION_PRESETS: { id: string; label: string; style: Partial<CaptionStyle> }[] = [
  { id: 'clean', label: 'Clean', style: { font: 'montserrat', color: '#ffffff', uppercase: false, active: 'none', activeColor: '#ffd84d', stroke: .5, glow: undefined, shadow: false } },
  { id: 'mrbeast', label: 'MrBeast', style: { font: 'montserrat', color: '#ffffff', uppercase: true, active: 'pop', activeColor: '#ffe02e', stroke: 1.9, glow: undefined, shadow: true } },
  { id: 'neon', label: 'Gaming neon', style: { font: 'bangers', color: '#e9fbff', uppercase: true, active: 'pop', activeColor: '#3cf5ff', stroke: .7, glow: '#21d4ff', shadow: false } },
  { id: 'karaoke', label: 'Karaoke', style: { font: 'lilita', color: '#ffffff', uppercase: false, active: 'karaoke', activeColor: '#4ce07a', stroke: 1.2, glow: undefined, shadow: true } },
  { id: 'block', label: 'Colour block', style: { font: 'anton', color: '#ffffff', uppercase: true, active: 'box', activeColor: '#ff3d6e', stroke: 1, glow: undefined, shadow: false } },
  { id: 'punch', label: 'Punch', style: { font: 'anton', color: '#ffffff', uppercase: true, active: 'pop', activeColor: '#ffe600', stroke: 1.6, glow: undefined, shadow: true } },
  { id: 'gold', label: 'Gold rush', style: { font: 'luckiest', color: '#fff6d6', uppercase: true, active: 'pop', activeColor: '#ffc400', stroke: 1.8, glow: undefined, shadow: true } },
  { id: 'hype', label: 'Hype red', style: { font: 'titan', color: '#ffffff', uppercase: true, active: 'box', activeColor: '#ff2d55', stroke: 1, glow: undefined, shadow: false } },
  { id: 'neon-pink', label: 'Neon pink', style: { font: 'bangers', color: '#fff0fb', uppercase: true, active: 'pop', activeColor: '#ff4fd8', stroke: .7, glow: '#ff2bd1', shadow: false } },
  { id: 'arcade', label: 'Arcade', style: { font: 'pressstart', color: '#ffffff', uppercase: true, active: 'pop', activeColor: '#39ff14', stroke: 1.2, glow: '#00ff66', shadow: false } },
  { id: 'spooky', label: 'Spooky', style: { font: 'creepster', color: '#e8ffd6', uppercase: false, active: 'pop', activeColor: '#7cff4f', stroke: 1, glow: '#39ff14', shadow: false } },
  { id: 'comic', label: 'Comic', style: { font: 'comic', color: '#ffffff', uppercase: false, active: 'box', activeColor: '#4da3ff', stroke: 1.3, glow: undefined, shadow: true } },
  { id: 'marker', label: 'Marker', style: { font: 'marker', color: '#ffffff', uppercase: false, active: 'pop', activeColor: '#ffb703', stroke: 1.2, glow: undefined, shadow: true } },
  { id: 'bubble', label: 'Bubble', style: { font: 'fredoka', color: '#ffffff', uppercase: false, active: 'karaoke', activeColor: '#ff8ad8', stroke: 1.4, glow: undefined, shadow: true } },
  { id: 'lyric', label: 'Lyric', style: { font: 'sora', color: '#ffffff', uppercase: false, active: 'karaoke', activeColor: '#7aa7ff', stroke: .6, glow: undefined, shadow: true } },
  { id: 'news', label: 'Tall news', style: { font: 'bebas', color: '#ffffff', uppercase: true, active: 'box', activeColor: '#111111', stroke: .4, glow: undefined, shadow: false } },
  { id: 'minimal', label: 'Minimal', style: { font: 'inter', color: '#ffffff', uppercase: false, active: 'none', activeColor: '#ffffff', stroke: .5, glow: undefined, shadow: true } },
];
/** Words that earn a caption an emoji, first match wins: one small, fitting touch per line, like the big channels do. */
const CAPTION_EMOJI: [RegExp, string][] = [
  [/\b(money|cash|dollars?|rich|robux|paid|pay|million|millions|thousand|\$\d)/i, '💰'], [/\b(win|won|winner|victory|champion|first place)\b/i, '🏆'],
  [/\b(dead|died|die|dying|killed|rip)\b/i, '💀'], [/\b(haha|lol|funny|laugh|joke|hilarious)\b/i, '😂'], [/\b(fire|lit|hot)\b/i, '🔥'],
  [/\b(crazy|insane|wild|no way|unbelievable|shocked)\b/i, '😱'], [/\b(scared|scary|creepy|horror)\b/i, '😨'], [/\b(love|heart)\b/i, '❤️'],
  [/\b(fast|speed|quick|zoom)\b/i, '⚡'], [/\b(subscribers?|followers?|views|viral|grow)\b/i, '📈'], [/\b(game|gaming|play|played|playing)\b/i, '🎮'],
  [/\b(music|song|beat)\b/i, '🎵'], [/\b(cool|nice|smooth)\b/i, '😎'], [/\b(food|eat|hungry|pizza)\b/i, '🍔'],
];
export const captionEmoji = (text: string) => CAPTION_EMOJI.find(([pattern]) => pattern.test(text))?.[1];
/**
 * A picture on top of the video: a platform logo from the built-in set, or one of the project's own images.
 * x and y place its centre, size is its height, all as shares of the frame.
 */
export type Overlay = { id: string; source: 'icon' | 'image'; icon?: string; assetId?: string; style: 'color' | 'white' | 'badge'; start: number; duration: number; x: number; y: number; size: number; animation: 'fade' | 'none'; /** A highlight it moves with, like a title's. */ follow?: string };
/** `role` tells music (beats, ducking under speech) from short sound effects. Older projects: faded clips are music. */
export type AudioClip ={ id: string; assetId: string; start: number; in: number; duration: number; volume: number; fade: boolean; role?: 'music' | 'sfx' };
export const isMusic = (a: AudioClip) => (a.role ?? (a.fade ? 'music' : 'sfx')) === 'music';
/** What the cut is for: a game's own trailer, a YouTube Short, or a long YouTube video. */
export type Mode = 'trailer' | 'short' | 'long';
/** `duck` (on unless false): music drops while someone speaks, following the captions. */
export type Timeline = { compounds?: Compound[]; removedMediaIds?: string[]; layerSettings?: Record<string, LayerSettings>; name: string; mode: Mode; format: 'landscape' | 'vertical' | 'square'; clips: Clip[]; titles: Title[]; overlays: Overlay[]; /** A second video over the footage: facecam, split screen, green screen (pip.ts). */ videoOverlays: VideoOverlay[]; effects: Effect[]; captions: Caption[]; captionStyle: CaptionStyle; audio: AudioClip[]; duck?: boolean };
export type Message = { role: 'user' | 'assistant'; text: string };
export type Revision = { timeline: Timeline; label: string; at: number };
export type SavedProject = { id: string; timeline: Timeline; messages: Message[]; updatedAt: number; revisions?: Revision[]; cuts?: NamedCut[] };
/** The studio's title faces (keys of EDITOR_FONTS in lib/fonts), listed here so the server can check them without loading fonts. */
export const FONT_KEYS = ['luckiest', 'titan', 'lilita', 'fredoka', 'comic', 'montserrat', 'bangers', 'anton', 'bebas', 'sora', 'inter', 'creepster', 'marker', 'pressstart', 'archivo', 'barlow', 'blackops', 'caveat', 'dmserif', 'league', 'orbitron', 'oswald', 'playfair', 'poppins', 'righteous', 'roboto', 'spacegrotesk', 'unbounded'] as const;
/** Visual cues let the reference analyzer choose by letterform shape, not just guess from unfamiliar keys. */
export const FONT_MATCH_HINTS: Record<(typeof FONT_KEYS)[number], string> = {
  luckiest: 'rounded, playful, chunky display lettering', titan: 'very heavy, rounded geometric display sans', lilita: 'soft, thick, friendly display sans', fredoka: 'rounded geometric sans with even strokes', comic: 'casual handwritten comic sans', montserrat: 'geometric bold sans with broad uppercase', bangers: 'angled comic book lettering', anton: 'very heavy, narrow condensed sans', bebas: 'tall, narrow all-caps display sans', sora: 'clean geometric sans with a modern tech feel', inter: 'neutral modern UI sans', creepster: 'uneven horror lettering with drips', marker: 'bold handwritten marker lettering', pressstart: 'square pixel arcade lettering',
  archivo: 'dense, very heavy geometric sans with compact counters', barlow: 'extremely condensed sans for tall impactful headlines', blackops: 'stencil cutouts and military arcade display lettering', caveat: 'loose connected handwritten script', dmserif: 'high contrast editorial serif with rounded terminals', league: 'wide, heavy geometric sans with clean shapes', orbitron: 'angular futuristic squared science fiction lettering', oswald: 'narrow condensed sans with a newsroom poster feel', playfair: 'high contrast elegant fashion and editorial serif', poppins: 'round geometric sans with single-storey forms', righteous: 'rounded retro futuristic display lettering', roboto: 'familiar neutral sans with compact proportions', spacegrotesk: 'geometric sans with distinctive open shapes and modern tech tone', unbounded: 'wide, soft futuristic display lettering with rounded geometry',
};
/** The built-in logos (keys of ICONS in icons.ts), listed here so the server can check them. */
export const ICON_KEYS = ['twitch', 'youtube', 'tiktok', 'discord', 'x', 'instagram', 'kick', 'roblox', 'spotify', 'patreon'] as const;
export const CAPTION_STYLE: CaptionStyle = { font: 'montserrat', color: '#ffffff', size: .06, x: .5, y: .78, uppercase: false, active: 'none', activeColor: '#ffd84d', stroke: .5 };
export const EMPTY: Timeline = { name: 'Untitled trailer', mode: 'trailer', format: 'landscape', clips: [], titles: [], overlays: [], videoOverlays: [], effects: [], captions: [], captionStyle: CAPTION_STYLE, audio: [] };
export const MODES: Record<Mode, { label: string; format: Timeline['format']; max: number; name: string }> = {
  trailer: { label: 'Game trailer', format: 'landscape', max: 180, name: 'Untitled trailer' },
  short: { label: 'Shorts', format: 'vertical', max: 180, name: 'Untitled short' },
  long: { label: 'Long form', format: 'landscape', max: 3600, name: 'Untitled video' },
};
/** Longest cut a mode allows, in seconds. */
export const maxLength = (mode: Mode) => MODES[mode].max;
export const lengthLabel = (mode: Mode) => `${maxLength(mode) / 60} minutes`;
export const dimensions = (format: Timeline['format']) => format === 'vertical' ? [1080, 1920] : format === 'square' ? [1080, 1080] : [1920, 1080];
export const clipLength = (clip: Clip) => motionLength(clip);
export const duration = (timeline: Timeline) => timeline.clips.reduce((sum, c) => sum + clipLength(c), 0);
export const uid = () => crypto.randomUUID();
export function positions(timeline: Timeline) { let time = 0; return timeline.clips.map(clip => { const start = time; time += clipLength(clip); return { clip, start, end: time }; }); }
export function newClip(asset: MediaInfo): Clip { return { id: uid(), assetId: asset.id, in: 0, out: Math.min(asset.kind === 'image' ? 4 : asset.duration, 12), speed: 1, volume: 1, zoom: 1, focusX: .5, fade: false }; }
export function newTitle(start = 0, text = 'YOUR NEXT BIG MOMENT'): Title { return { id: uid(), text, start, duration: 3, x: .5, y: .76, size: .065, color: '#ffffff', font: 'luckiest', animation: 'fade' }; }
export function splitClip(timeline: Timeline, id: string, at: number): Timeline {
  const spot = positions(timeline).find(p => p.clip.id === id);
  if (!spot || at - spot.start < .1 || spot.end - at < .1) return timeline;
  const local = at - spot.start, copyId = uid(), settings = { ...timeline.layerSettings };
  for (const [key, setting] of Object.entries(settings)) if (setting.attachment?.clipId === id && setting.attachment.offset >= local) settings[key] = { ...setting, attachment: { clipId: copyId, offset: setting.attachment.offset - local } };
  return { ...timeline, layerSettings: settings, compounds: timeline.compounds?.map(g => g.members.includes(id) ? { ...g, members: [...g.members, copyId] } : g), clips: timeline.clips.flatMap(c => c.id === id ? [sliceMotion(c, 0, local), { ...sliceMotion(c, local, clipLength(c)), id: copyId, transition: undefined }] : [c]) };
}
const number = (v: unknown, min: number, max: number, label: string) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${label}.`); return v; };
const string = (v: unknown, max: number, label: string) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`Invalid ${label}.`); return v; };
const text = (value: unknown, max: number) => { if (typeof value !== 'string' || value.length > max) throw new Error('Invalid title.'); return value; };
const color = (v: unknown) => /^#[\da-f]{6}$/i.test(String(v)) ? String(v) : '#ffffff';
// Projects saved before fonts existed fall back to the studio's default title face.
const font = (v: unknown, fallback: string) => v === undefined ? fallback : (FONT_KEYS as readonly unknown[]).includes(v) ? v as string : (() => { throw new Error('Choose one of the studio fonts.'); })();
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid timeline.'); return v as Record<string, unknown>; };
/** A traced outline: small cut-outs in a fixed run-length text form, never anything that runs. */
const highlightMask = (v: unknown): HighlightMask => {
  const m = object(v), w = number(m.w, 8, 640, 'outline width'), h = number(m.h, 8, 640, 'outline height');
  if (!Array.isArray(m.frames) || m.frames.length > 900 || m.frames.some(f => typeof f !== 'string' || f.length > 200000 || !/^[0-9a-z,]*$/.test(f))) throw new Error('Invalid traced outline.');
  return { start: number(m.start, 0, 86400, 'outline start'), fps: number(m.fps, 1, 30, 'outline frame rate'), w: Math.round(w), h: Math.round(h), frames: m.frames as string[], ...(m.edited === true ? { edited: true } : {}) };
};
/** A built-in or own-pack sound effect id, or nothing: never a path or a file name from outside the libraries. */
const sound = (v: unknown) => typeof v === 'string' && !!findSound(v);
const withSound = (e: Effect, v: unknown): Effect => sound(v) ? { ...e, sound: v as string } : e;
export const TITLE_ANIMATIONS: { id: TitleAnimation; label: string }[] = [{ id: 'pop', label: 'Pop' }, { id: 'fade', label: 'Fade' }, { id: 'typewriter', label: 'Typewriter' }, { id: 'slide', label: 'Slide in' }, { id: 'bounce', label: 'Bounce' }, { id: 'shake', label: 'Shake' }, { id: 'glitch', label: 'Glitch' }, { id: 'none', label: 'None' }];
/** Shared by AI, export and restore: no arbitrary commands, paths or unknown assets. */
export function validateTimeline(input: unknown, assets: MediaInfo[]): Timeline {
  const raw = object(input);
  if (!['landscape', 'vertical', 'square'].includes(String(raw.format))) throw new Error('Choose a supported aspect ratio.');
  // Projects saved before modes existed were all trailers.
  const mode = (raw.mode ?? 'trailer') as Mode;
  if (!Object.hasOwn(MODES, mode)) throw new Error('Choose a supported video type.');
  const max = maxLength(mode);
  const list = (value: unknown, max: number) => { if (value === undefined) return []; if (!Array.isArray(value) || value.length > max) throw new Error('Too many timeline items.'); return value.map(object); };
  const ids = new Set<string>();
  const id = (v: unknown) => { const s = string(v, 100, 'item id'); if (ids.has(s)) throw new Error('Timeline item IDs must be unique.'); ids.add(s); return s; };
  const media = (v: unknown, audio = false) => { const a = assets.find(a => a.id === v); if (!a || (audio ? a.kind !== 'audio' : a.kind === 'audio')) throw new Error('A timeline item refers to unavailable media.'); return a; };
  // A follow or behind names a highlight by id; checked once every effect is known, below.
  const tracking = (v: Record<string, unknown>, key: 'follow' | 'behind') => typeof v[key] === 'string' && v[key] && (v[key] as string).length <= 100 ? { [key]: v[key] as string } : {};
  const clips = list(raw.clips, 1000).map(c => {
    const a = media(c.assetId); const start = number(c.in, 0, a.kind === 'image' ? 180 : a.duration, 'source start');
    const out = number(c.out, start + .05, a.kind === 'image' ? 180 : a.duration + .001, 'source end');
    const tr = c.transition === undefined || c.transition === null ? undefined : object(c.transition);
    if (tr && !(TRANSITION_KINDS as readonly unknown[]).includes(tr.kind)) throw new Error('Choose one of the clip transitions.');
    const grade = validateGrade(c.grade);
    if (c.reverse === true && out - start > 15) throw new Error('Reverse works on clips up to 15 seconds of footage. Trim the clip first.');
    return { ...(grade ? { grade } : {}), ...(c.reverse === true && a.kind === 'video' && (c.freeze === undefined || c.freeze === null) ? { reverse: true } : {}), id: id(c.id), assetId: a.id, in: start, out, speed: number(c.speed, .25, 4, 'speed'), volume: number(c.volume, 0, 1, 'volume'), zoom: number(c.zoom, 1, 3, 'zoom'), focusX: number(c.focusX, 0, 1, 'crop position'), fade: c.fade === true, ...(c.keyframes !== undefined ? { keyframes: validateKeyframes(c.keyframes) } : {}), ...(c.speedPoints !== undefined && c.speedPoints !== null ? { speedPoints: validateSpeedPoints(c.speedPoints) } : {}), ...(c.freeze !== undefined && c.freeze !== null ? { freeze: number(c.freeze, start, out, "freeze frame"), hold: number(c.hold ?? 1, .1, 30, "freeze duration") } : {}), ...(tr ? { transition: { kind: tr.kind as Transition['kind'], duration: number(tr.duration ?? .4, .15, 1.2, 'transition length'), ...(tr.sound === null ? { sound: null } : sound(tr.sound) ? { sound: tr.sound as string } : {}) } } : {}) };
  });
  const titles = list(raw.titles, 500).map(t => ({ id: id(t.id), text: text(t.text, 160), start: number(t.start, 0, max, 'title start'), duration: number(t.duration, .1, max, 'title duration'), x: number(t.x, 0, 1, 'title x'), y: number(t.y, 0, 1, 'title y'), size: number(t.size, .02, .18, 'font size'), color: color(t.color), font: font(t.font, 'luckiest'), animation: (TITLE_ANIMATIONS.some(a => a.id === t.animation) ? t.animation : 'fade') as Title['animation'], ...(sound(t.sound) ? { sound: t.sound as string } : {}), ...(typeof t.accent === 'string' && /^#[\da-f]{6}$/i.test(t.accent) ? { accent: t.accent } : {}), ...tracking(t, 'follow'), ...tracking(t, 'behind') }));
  const overlays = list(raw.overlays, 500).map(o => {
    const source: Overlay['source'] = o.source === 'image' ? 'image' : 'icon';
    if (source === 'icon' && !(ICON_KEYS as readonly unknown[]).includes(o.icon)) throw new Error('Use one of the built-in logos.');
    const image = source === 'image' ? assets.find(a => a.id === o.assetId && a.kind === 'image') : undefined;
    if (source === 'image' && !image) throw new Error('An overlay refers to an image that is not in this project.');
    return { id: id(o.id), source, ...(source === 'icon' ? { icon: o.icon as string } : { assetId: image!.id }), style: (['white', 'badge'].includes(String(o.style)) ? o.style : 'color') as Overlay['style'], start: number(o.start, 0, max, 'overlay start'), duration: number(o.duration, .1, max, 'overlay duration'), x: number(o.x, 0, 1, 'overlay x'), y: number(o.y, 0, 1, 'overlay y'), size: number(o.size, .03, .8, 'overlay size'), animation: (o.animation === 'none' ? 'none' : 'fade') as Overlay['animation'], ...tracking(o, 'follow') };
  });
  // A second video over the footage (pip.ts): a video or an image, trimmed inside its source, at most six at once.
  const videoOverlays = list(raw.videoOverlays, 6).map((v): VideoOverlay => {
    const a = media(v.assetId), from = number(v.in ?? 0, 0, a.kind === 'image' ? 86400 : a.duration, 'overlay video start');
    if (!PIP_LAYOUTS.some(l => l.id === v.layout)) throw new Error('Choose a supported video layout.');
    const split = String(v.layout).startsWith('split-'), c = v.crop === undefined || v.crop === null ? undefined : object(v.crop), k = v.chromaKey === undefined || v.chromaKey === null ? undefined : object(v.chromaKey);
    const crop = c && (() => { const x = number(c.x, 0, .95, 'crop x'), y = number(c.y, 0, .95, 'crop y'); return { x, y, w: number(c.w, .05, 1 - x + .001, 'crop width'), h: number(c.h, .05, 1 - y + .001, 'crop height') }; })();
    return { id: id(v.id), assetId: a.id, start: number(v.start, 0, max, 'overlay video start'), in: from, duration: number(v.duration, .1, a.kind === 'image' ? max : Math.min(max, a.duration - from + .001), 'overlay video duration'), volume: number(v.volume ?? 1, 0, 1, 'overlay video volume'), layout: v.layout as VideoOverlay['layout'], x: number(v.x ?? .5, 0, 1, 'overlay video x'), y: number(v.y ?? .5, 0, 1, 'overlay video y'), size: number(v.size ?? .5, split ? .2 : .05, split ? .8 : 1, 'overlay video size'), ...(crop && (crop.x > 0 || crop.y > 0 || crop.w < 1 || crop.h < 1) ? { crop } : {}), ...(k ? { chromaKey: { color: /^#[\da-f]{6}$/i.test(String(k.color)) ? String(k.color).toLowerCase() : '#00ff00', similarity: number(k.similarity ?? .3, .01, .8, 'key similarity'), blend: number(k.blend ?? .1, 0, .5, 'key softness') } } : {}) };
  });
  const effects = list(raw.effects, 2000).map((e): Effect => withSound(effectOf(e), e.sound));
  // A link to a highlight that is gone (deleted, or never there) is dropped rather than failing the whole cut; going
  // behind an object needs its traced shape, but the trace may still be on its way, so only the kind is checked.
  const highlights = new Set(effects.filter(e => e.kind === 'highlight').map(e => e.id));
  const linked = <T extends object>(item: T): T => { const { follow, behind, ...rest } = item as T & { follow?: string; behind?: string }; return { ...rest, ...(follow && highlights.has(follow) ? { follow } : {}), ...(behind && highlights.has(behind) ? { behind } : {}) } as T; };
  titles.splice(0, titles.length, ...titles.map(item => linked(item))); overlays.splice(0, overlays.length, ...overlays.map(item => linked(item)));
  effects.splice(0, effects.length, ...effects.map(e => e.kind === 'counter' || e.kind === 'bar' ? linked<typeof e>(e) : e));
  function effectOf(e: Record<string, unknown>): Effect {
    if (!(EFFECT_KINDS as readonly unknown[]).includes(e.kind)) throw new Error('Use one of the animation presets.');
    const base = { id: id(e.id), start: number(e.start, 0, max, 'effect start'), duration: number(e.duration, .1, e.kind === 'counter' || e.kind === 'zoom' && e.mode === 'hold' ? max : 30, 'effect length') };
    if (e.kind === 'counter') {
      const label = (v: unknown) => typeof v === 'string' && v.length <= 24 ? v : '';
      if (e.easing !== undefined && !isEasing(e.easing)) throw new Error('Choose a supported counting easing.');
      const curve = validateBezier(e.curve);
      if (curve && (curve[1] > 1 || curve[3] > 1 || curve[1] > curve[3])) throw new Error('Counter Bézier handles must progress from 0 to 1 without overshoot.');
      if (['backOut', 'elasticOut', 'bounceOut'].includes(String(e.easing))) throw new Error('Use a smooth counting easing, and enable bounce for the counter appearance.');
      return { ...base, kind: 'counter', from: number(e.from, -1e12, 1e12, 'counter start'), to: number(e.to, -1e12, 1e12, 'counter end'), prefix: label(e.prefix), suffix: label(e.suffix), format: e.format === 'short' ? 'short' : 'full', x: number(e.x, 0, 1, 'counter x'), y: number(e.y, 0, 1, 'counter y'), size: number(e.size, .03, .3, 'counter size'), color: color(e.color), font: font(e.font, 'luckiest'), countDelay: number(e.countDelay ?? 0, 0, max, 'count delay'), countDuration: number(e.countDuration ?? Math.max(.2, base.duration - .45), .01, max, 'count duration'), easing: (e.easing ?? 'easeOut') as Easing, ...(curve ? { curve } : {}), entrance: (e.entrance === undefined || e.entrance === 'pop' ? 'pop' : 'none') as 'pop' | 'none', bounce: e.bounce === undefined ? true : e.bounce === true, decimals: number(e.decimals ?? 0, 0, 4, 'decimal places'), step: number(e.step ?? 0, 0, 1e12, 'counter step'), padding: number(e.padding ?? 0, 0, 12, 'digit padding'), separators: e.separators !== false, ...tracking(e, 'follow') };
    }
    if (e.kind === 'zoom') {
      if (e.mode !== undefined && e.mode !== 'hold' && e.mode !== 'punch') throw new Error('Choose a supported zoom style.');
      if (e.easing !== undefined && !isEasing(e.easing)) throw new Error('Choose a supported zoom easing.');
      return { ...base, kind: 'zoom', ...tracking(e, 'follow'), ...(e.blur === false ? { blur: false } : {}), amount: number(e.amount, e.mode === 'hold' ? 1 : 1.05, 2.5, 'zoom amount'), x: number(e.x, 0, 1, 'zoom x'), y: number(e.y, 0, 1, 'zoom y'), ...(e.mode !== 'hold' && e.easing !== undefined ? { easing: e.easing as Easing, ...(e.curve !== undefined ? { curve: validateBezier(e.curve) } : {}) } : {}), ...(e.mode === 'hold' ? { mode: 'hold' as const, rampDuration: number(e.rampDuration ?? base.duration, .01, base.duration, 'zoom easing duration'), easing: (e.easing ?? 'easeInOut') as Easing, ...(e.curve !== undefined ? { curve: validateBezier(e.curve) } : {}) } : {}) };
    }
    if (e.kind === 'shake') return { ...base, kind: 'shake', strength: number(e.strength, .005, .08, 'shake strength') };
    if (e.kind === 'highlight') return { ...base, kind: 'highlight', x: number(e.x, 0, 1, 'highlight x'), y: number(e.y, 0, 1, 'highlight y'), w: number(e.w, .02, 1, 'highlight width'), h: number(e.h, .02, 1, 'highlight height'), color: color(e.color), shape: e.shape === 'box' ? 'box' : 'ellipse', style: e.style === 'tint' || e.style === 'spotlight' || e.style === 'sticker' || e.style === 'none' ? e.style : 'outline', ...(e.look === 'flash' || e.look === 'cycle' || e.look === 'sweep' ? { look: e.look, ...(e.look === 'flash' ? { lookColor: color(e.lookColor ?? '#ffffff'), lookDuration: number(e.lookDuration ?? Math.min(.2, base.duration), .05, base.duration, 'flash duration') } : e.look === 'cycle' ? { endColor: color(e.endColor ?? '#ffbf47'), changeAt: number(e.changeAt ?? 1, 0, base.duration, 'colour change time') } : { every: number(e.every ?? 1, .2, 10, 'sweep interval') }) } : {}), ...(e.reveal === 'draw' || e.reveal === 'fade' ? { reveal: e.reveal } : {}), ...(e.pulse === true ? { pulse: true } : {}), ...(typeof e.label === 'string' && e.label.trim() ? { label: e.label.trim().slice(0, 40) } : {}), ...(e.points !== undefined ? { points: list(e.points, 32).map(value => { const p = object(value); if (p.label !== 0 && p.label !== 1) throw new Error('Choose include or exclude for the highlight point.'); return { x: number(p.x, 0, 1, 'highlight point x'), y: number(p.y, 0, 1, 'highlight point y'), label: p.label as 0 | 1 }; }) } : {}), ...(e.mask ? { mask: highlightMask(e.mask) } : {}) };
    if (e.kind === 'blur') return { ...base, kind: 'blur', x: number(e.x, 0, 1, 'blur x'), y: number(e.y, 0, 1, 'blur y'), w: number(e.w, .02, 1, 'blur width'), h: number(e.h, .02, 1, 'blur height'), style: e.style === 'pixelate' ? 'pixelate' : 'blur', strength: number(e.strength ?? .6, .05, 1, 'blur strength') };
    if (e.kind === 'bar') {
      if (e.easing !== undefined && !isEasing(e.easing)) throw new Error('Choose a supported bar easing.');
      return { ...base, kind: 'bar', x: number(e.x, 0, 1, 'bar x'), y: number(e.y, 0, 1, 'bar y'), w: number(e.w, .05, 1, 'bar width'), h: number(e.h, .01, .3, 'bar height'), from: number(e.from ?? 0, 0, 100, 'bar start value'), to: number(e.to ?? 100, 0, 100, 'bar end value'), ...(e.fill !== undefined && e.fill !== null ? { fill: number(e.fill, .05, max, 'bar fill time') } : {}), ...(e.easing !== undefined ? { easing: e.easing as Easing } : {}), color: color(e.color), back: /^#[\da-f]{6}$/i.test(String(e.back)) ? String(e.back) : '#1b1f2a', ...(typeof e.label === 'string' && e.label.trim() ? { label: e.label.trim().slice(0, 24) } : {}), ...(e.showValue === true ? { showValue: true } : {}), ...tracking(e, 'follow') };
    }
    return { ...base, kind: 'flash', color: color(e.color) };
  }
  const captions = list(raw.captions, 8000).map((c): Caption => {
    const words = Array.isArray(c.words) && c.words.length <= 60 ? c.words.map(w => object(w)).map(w => ({ start: number(w.start, 0, 30, 'word time'), end: number(w.end, 0, 30, 'word time') })) : undefined;
    const rawStyle = c.style === undefined ? undefined : object(c.style);
    const captionOverride: CaptionStyleOverride | undefined = rawStyle ? {
      ...(rawStyle.font !== undefined ? { font: font(rawStyle.font, CAPTION_STYLE.font) } : {}),
      ...(rawStyle.color !== undefined ? { color: color(rawStyle.color) } : {}),
      ...(rawStyle.size !== undefined ? { size: number(rawStyle.size, .02, .18, 'caption size') } : {}),
      ...(typeof rawStyle.uppercase === 'boolean' ? { uppercase: rawStyle.uppercase } : {}),
      ...(rawStyle.active !== undefined ? { active: rawStyle.active === 'pop' || rawStyle.active === 'box' || rawStyle.active === 'karaoke' || rawStyle.active === 'none' ? rawStyle.active : (() => { throw new Error('Invalid caption word effect.'); })() } : {}),
      ...(rawStyle.activeColor !== undefined ? { activeColor: color(rawStyle.activeColor) } : {}),
      ...(rawStyle.stroke !== undefined ? { stroke: number(rawStyle.stroke, 0, 3, 'caption outline') } : {}),
      ...(typeof rawStyle.glow === 'string' ? { glow: color(rawStyle.glow) } : {}),
      ...(typeof rawStyle.shadow === 'boolean' ? { shadow: rawStyle.shadow } : {}),
      ...(typeof rawStyle.emoji === 'boolean' ? { emoji: rawStyle.emoji } : {}),
    } : undefined;
    return { id: id(c.id), text: text(c.text, 120), start: number(c.start, 0, max, 'caption start'), duration: number(c.duration, .05, 30, 'caption duration'), ...(c.x !== undefined ? { x: number(c.x, 0, 1, 'caption x') } : {}), ...(c.y !== undefined ? { y: number(c.y, .05, .95, 'caption y') } : {}), ...(captionOverride && Object.keys(captionOverride).length ? { style: captionOverride } : {}), ...(words?.length ? { words } : {}) };
  });
  const style = raw.captionStyle === undefined ? CAPTION_STYLE : object(raw.captionStyle);
  const captionStyle: CaptionStyle = { font: font(style.font, CAPTION_STYLE.font), color: color(style.color), size: number(style.size, .02, .18, 'caption size'), x: style.x === undefined ? CAPTION_STYLE.x : number(style.x, 0, 1, 'caption horizontal position'), y: number(style.y, .05, .95, 'caption position'), uppercase: style.uppercase === true, active: style.active === 'box' || style.active === 'none' || style.active === 'karaoke' ? style.active : 'pop', activeColor: style.activeColor === undefined ? CAPTION_STYLE.activeColor : color(style.activeColor), ...(style.stroke !== undefined ? { stroke: number(style.stroke, 0, 3, 'caption outline') } : {}), ...(typeof style.glow === 'string' ? { glow: color(style.glow) } : {}), ...(style.shadow === true ? { shadow: true } : {}), ...(style.emoji === true ? { emoji: true } : {}), ...(typeof style.preset === 'string' && CAPTION_PRESETS.some(p => p.id === style.preset) ? { preset: style.preset } : {}) };
  const audio = list(raw.audio, 200).map(c => { const a = media(c.assetId, true); const start = number(c.in, 0, a.duration, 'audio source start'); return { id: id(c.id), assetId: a.id, start: number(c.start, 0, max, 'audio start'), in: start, duration: number(c.duration, .05, Math.min(max, a.duration - start + .001), 'audio duration'), volume: number(c.volume, 0, 1, 'audio volume'), fade: c.fade === true, ...(c.role === 'music' || c.role === 'sfx' ? { role: c.role as AudioClip['role'] } : {}) }; });
  const layerSettings: Record<string, LayerSettings> = Object.create(null);
  const allIds = new Set([...clips, ...titles, ...overlays, ...videoOverlays, ...effects, ...captions, ...audio].map(i => i.id));
  if (raw.layerSettings !== undefined) for (const [key, value] of Object.entries(object(raw.layerSettings))) { if (!allIds.has(key)) continue; const setting = object(value); layerSettings[key] = { name: typeof setting.name === 'string' ? setting.name.slice(0, 80) : undefined, hidden: setting.hidden === true, locked: setting.locked === true, ...(setting.keyframes !== undefined ? { keyframes: validateKeyframes(setting.keyframes) } : {}), ...(setting.attachment !== undefined ? (() => { const a = object(setting.attachment); if (!clips.some(c => c.id === a.clipId) || clips.some(c => c.id === key)) throw new Error('Invalid clip attachment.'); return { attachment: { clipId: String(a.clipId), offset: number(a.offset, -1200, 1200, 'attachment offset') } }; })() : {}) }; }
  const removedMediaIds = Array.isArray(raw.removedMediaIds) ? [...new Set(raw.removedMediaIds.filter((id): id is string => typeof id === 'string' && assets.some(a => a.id === id)))].slice(0, 200) : [];
  const compoundIds = new Set<string>(), groupedIds = new Set<string>();
  const compounds = list(raw.compounds, 500).map(g => { const groupId = string(g.id, 100, 'compound id'); if (compoundIds.has(groupId)) throw new Error('Duplicate compound id.'); compoundIds.add(groupId); if (!Array.isArray(g.members) || g.members.some(m => typeof m !== 'string' || !allIds.has(m) || groupedIds.has(m))) throw new Error('Invalid compound members.'); const members = [...new Set(g.members as string[])]; members.forEach(m => groupedIds.add(m)); const indices = clips.flatMap((c, i) => members.includes(c.id) ? [i] : []); if (!indices.length || Math.max(...indices) - Math.min(...indices) + 1 !== indices.length) throw new Error('Compound footage must be adjacent.'); return { id: groupId, name: string(g.name, 80, 'compound name'), members, collapsed: g.collapsed !== false }; });
  const timeline: Timeline = { ...(raw.compounds !== undefined ? { compounds } : {}), removedMediaIds, layerSettings, name: raw.name === '' ? MODES[mode].name : string(raw.name, 80, 'project name'), mode, format: raw.format as Timeline['format'], clips, titles, overlays, videoOverlays, effects, captions, captionStyle, audio, ...(raw.duck === false ? { duck: false } : {}) };
  if (duration(timeline) > max + .01) throw new Error(`Keep this cut under ${lengthLabel(mode)}.`);
  return timeline;
}
/** Where an overlay lands in a frame of the given size, keeping the picture's own shape. */
export function overlayBox(overlay: Overlay, width: number, height: number, aspect: number) { const h = height * overlay.size, w = h * aspect; return { x: width * overlay.x - w / 2, y: height * overlay.y - h / 2, w, h }; }
export function titleOpacity(title: Pick<Title, 'start' | 'duration' | 'animation'>, time: number) { const elapsed = time - title.start; if (elapsed < 0 || elapsed >= title.duration) return 0; return title.animation === 'none' ? 1 : Math.max(0, Math.min(1, elapsed / .2, (title.duration - elapsed) / .2)); }
/** The caption on screen at a moment, if any. Captions never overlap, so there is at most one. */
export const captionAt = (timeline: Timeline, time: number) => timeline.captions.find(c => time >= c.start && time < c.start + c.duration);
export const captionStyleFor = (timeline: Timeline, caption: Caption): CaptionStyle => ({ ...timeline.captionStyle, ...caption.style, x: caption.x ?? timeline.captionStyle.x ?? .5, y: caption.y ?? timeline.captionStyle.y });
export const captionText = (timeline: Timeline, caption: Caption): Title => { const style = captionStyleFor(timeline, caption); return { id: caption.id, text: (style.uppercase ? caption.text.toUpperCase() : caption.text) + (style.emoji && captionEmoji(caption.text) ? ' ' + captionEmoji(caption.text) : ''), start: caption.start, duration: caption.duration, x: style.x, y: style.y, size: style.size, color: style.color, font: style.font, animation: 'none' }; };
/** A font as the canvas needs it. The caller resolves the key, so this file never loads web fonts. */
export type Face = { family: string; weight: string };
/** The area a title covers in the frame, for clicking it on the preview. Matches how drawTitle wraps lines. */
export function titleBox(ctx: CanvasRenderingContext2D, title: Title, width: number, height: number, face: Face) {
  ctx.save(); ctx.font = `${face.weight} ${Math.round(height * title.size)}px ${face.family}, Arial, sans-serif`;
  const maxWidth = width * .86; let widest = 0, count = 0;
  for (const paragraph of title.text.split('\n')) { let line = ''; for (const word of paragraph.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && ctx.measureText(next).width > maxWidth) { widest = Math.max(widest, ctx.measureText(line).width); count++; line = word; } else line = next; } widest = Math.max(widest, ctx.measureText(line).width); count++; }
  ctx.restore();
  const w = Math.min(maxWidth, widest) + height * title.size * .3, h = count * height * title.size * 1.15 + height * title.size * .2;
  return { x: width * title.x - w / 2, y: height * title.y - h / 2, w, h };
}
/** The words of a caption as shown, split the way they are drawn. */
export const captionWords = (text: string) => text.split(/\s+/).filter(Boolean);
/**
 * Which shown word is being said at a moment and how far into its pop it is (0 to 1). Whisper's word times are used
 * when the caption still has the same number of words; a caption edited by hand spreads its words over its length,
 * longer words taking longer. Between two words the last one said stays lit, as in CapCut.
 */
export function captionActive(caption: Caption, shown: string[], t: number) {
  const n = shown.length; if (!n) return null;
  let times: CaptionWord[];
  if (caption.words?.length === n) times = caption.words;
  else {
    const total = shown.reduce((s, w) => s + w.length + 1, 0); let at = 0;
    times = shown.map(w => { const start = at; at += (w.length + 1) / total * caption.duration; return { start, end: at }; });
  }
  const u = t - caption.start; let index = -1;
  for (let i = 0; i < n; i++) if (u >= Math.min(times[i].start, caption.duration - .05)) index = i;
  if (index < 0) return null;
  return { index, progress: Math.min(1, Math.max(0, (u - times[index].start) / .18)) };
}
/**
 * A caption drawn word by word, so the word being said can stand out: it springs up a little in the highlight colour,
 * or sits on a rounded block of it. Wraps lines exactly like drawTitle, so its box and click area still match.
 */
export function drawCaption(ctx: CanvasRenderingContext2D, title: Title, style: CaptionStyle, active: { index: number; progress: number } | null, width: number, height: number, face: Face) {
  const mode = style.active ?? 'pop', look: TextLook = { stroke: style.stroke, glow: style.glow, shadow: style.shadow };
  if (mode === 'none' || !active) return drawTitle(ctx, title, width, height, face, 1, null, look);
  ctx.save();
  const px = Math.round(height * title.size);
  ctx.font = `${face.weight} ${px}px ${face.family}, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const maxWidth = width * .86, space = ctx.measureText(' ').width, words = captionWords(title.text);
  const lines: number[][] = [];
  const widthOf = (ids: number[]) => ctx.measureText(ids.map(i => words[i]).join(' ')).width;
  let wordIndex = 0;
  for (const paragraph of title.text.split('\n')) {
    const paragraphWords = paragraph.split(/\s+/).filter(Boolean);
    if (!paragraphWords.length) { lines.push([]); continue; }
    let line: number[] = [];
    for (let n = 0; n < paragraphWords.length; n++) {
      const i = wordIndex++;
      if (line.length && widthOf([...line, i]) > maxWidth) { lines.push(line); line = [i]; }
      else line.push(i);
    }
    if (line.length) lines.push(line);
  }
  const lineHeight = height * title.size * 1.15, placed: { i: number; x: number; y: number; w: number }[] = [];
  const pop = easeOutBack(active.progress);
  // The lit word makes room for itself as it grows, so it never runs into its neighbours.
  const room = (i: number) => i !== active.index ? 0 : mode === 'pop' || mode === 'karaoke' ? ctx.measureText(words[i]).width * .14 * pop : px * .4 * pop;
  lines.forEach((ids, row) => {
    const y = height * title.y + (row - (lines.length - 1) / 2) * lineHeight;
    let x = width * title.x - (widthOf(ids) + ids.reduce((s, i) => s + room(i), 0)) / 2;
    for (const i of ids) { const w = ctx.measureText(words[i]).width, extra = room(i); placed.push({ i, x: x + extra / 2, y, w }); x += w + extra + space; }
  });
  const lit = placed.find(p => p.i === active.index);
  // Each word in the preset's look: drop shadow under, thick or thin outline, neon glow, then the fill.
  const word = (p: (typeof placed)[number], color: string) => {
    const text = words[p.i];
    if (look.shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * .18; ctx.shadowOffsetY = px * .1; ctx.fillStyle = '#0b0a09'; ctx.fillText(text, p.x, p.y); ctx.restore(); }
    ctx.strokeStyle = '#0b0a09'; ctx.lineWidth = px * .14 * (look.stroke ?? 1); if (ctx.lineWidth > 0) ctx.strokeText(text, p.x, p.y);
    if (look.glow) { ctx.save(); ctx.shadowColor = color === title.color ? look.glow : color; ctx.shadowBlur = px * .4; ctx.fillStyle = color; ctx.fillText(text, p.x, p.y); ctx.restore(); }
    ctx.fillStyle = color; ctx.fillText(text, p.x, p.y);
  };
  // Karaoke: every word already sung keeps the highlight colour, like a lyric line filling up.
  for (const p of placed) if (p !== lit) word(p, mode === 'karaoke' && p.i < active.index ? style.activeColor ?? '#ffd84d' : title.color);
  if (lit) {
    // The lit word goes on top, scaled around its own centre so it never shifts the rest of the line.
    ctx.save(); ctx.translate(lit.x + lit.w / 2, lit.y);
    const s = mode === 'pop' || mode === 'karaoke' ? 1 + .14 * pop : .9 + .1 * pop; ctx.scale(s, s); ctx.translate(-(lit.x + lit.w / 2), -lit.y);
    if (mode === 'box') {
      const padX = px * .2, padY = px * .12;
      ctx.beginPath(); ctx.roundRect(lit.x - padX, lit.y - px * .55 - padY, lit.w + padX * 2, px * 1.1 + padY * 2, px * .22);
      ctx.fillStyle = style.activeColor ?? '#ffd84d'; ctx.fill();
      word(lit, title.color);
    } else word(lit, style.activeColor ?? '#ffd84d');
    ctx.restore();
  }
  ctx.restore();
}
/** Used for the canvas preview and export overlays, for both titles and captions. */
/**
 * Used for the canvas preview and export overlays, for both titles and captions. `motion` is an animation's move at
 * this moment (titleMotion: slide, bounce, shake, glitch, typewriter); `look` the caption preset's outline, neon glow
 * and drop shadow.
 */
export function drawTitle(ctx: CanvasRenderingContext2D, title: Title, width: number, height: number, face: Face, scale = 1, motion?: TitleMotion | null, look?: TextLook) {
  ctx.save();
  const cx = width * (title.x + (motion?.dx ?? 0)), cy = height * (title.y + (motion?.dy ?? 0));
  // Animated titles grow, shrink and turn around their own centre.
  if (scale !== 1 || motion?.rot) { ctx.translate(cx, cy); ctx.rotate(motion?.rot ?? 0); ctx.scale(scale, scale); ctx.translate(-cx, -cy); }
  ctx.font = `${face.weight} ${Math.round(height * title.size)}px ${face.family}, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const maxWidth = width * .86; const lines: string[] = [], accents: { at: number; word: string }[][] = [];
  // *Starred* words stand out in the accent colour ("I got *1,000,000* Robux"); the stars themselves never show.
  for (const paragraph of title.text.split('\n')) {
    let line = '', marks: { at: number; word: string }[] = [], on = false;
    for (const raw of paragraph.split(/\s+/)) {
      const starts = raw.startsWith('*'), word = raw.replace(/\*/g, ''), lit = on || starts; if (raw.split('*').length % 2 === 0) on = !on;
      if (!word) continue;
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); accents.push(marks); line = word; marks = []; } else line = next;
      if (lit) marks.push({ at: line.length - word.length, word });
    }
    lines.push(line); accents.push(marks);
  }
  const lineHeight = height * title.size * 1.15, px = height * title.size;
  // Typewriter: the lines are laid out whole, then only the characters typed so far are drawn, so nothing shifts.
  let left = motion?.chars ?? Infinity;
  const pass = (draw: (text: string, x: number, y: number, line: number) => void) => {
    let remaining = left;
    lines.forEach((line, i) => {
      const full = Math.min(maxWidth, ctx.measureText(line).width), squeeze = full / Math.max(1, ctx.measureText(line).width);
      const y = cy + (i - (lines.length - 1) / 2) * lineHeight, shown = line.slice(0, Math.max(0, remaining));
      remaining -= line.length + 1;
      if (!shown) return;
      ctx.save(); ctx.translate(cx - full / 2, y); ctx.scale(squeeze, 1); draw(shown, 0, 0, i); ctx.restore();
    });
  };
  if (look?.shadow) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * .18; ctx.shadowOffsetY = px * .1; ctx.fillStyle = '#0b0a09'; pass((s, x, y) => ctx.fillText(s, x, y)); ctx.restore(); }
  ctx.strokeStyle = '#0b0a09'; ctx.lineWidth = px * .14 * (look?.stroke ?? 1);
  if (ctx.lineWidth > 0) pass((s, x, y) => ctx.strokeText(s, x, y));
  if (look?.glow) { ctx.save(); ctx.shadowColor = look.glow; ctx.shadowBlur = px * .45; ctx.fillStyle = look.glow; pass((s, x, y) => ctx.fillText(s, x, y)); ctx.restore(); }
  // A glitch draws red and cyan ghosts either side before the real text.
  if (motion?.glitch) {
    const split = px * .08 * motion.glitch; ctx.save(); ctx.globalAlpha *= .8;
    ctx.fillStyle = '#ff2a55'; pass((s, x, y) => ctx.fillText(s, x - split, y)); ctx.fillStyle = '#00e5ff'; pass((s, x, y) => ctx.fillText(s, x + split, y)); ctx.restore();
  }
  ctx.fillStyle = title.color; pass((s, x, y) => ctx.fillText(s, x, y));
  if (accents.some(a => a.length)) { ctx.fillStyle = title.accent ?? ACCENT; pass((s, x, y, i) => { for (const m of accents[i]) if (m.at < s.length) ctx.fillText(s.slice(m.at, m.at + m.word.length), x + ctx.measureText(s.slice(0, m.at)).width, y); }); }
  ctx.restore();
}
/** The colour *starred* title words take when the title sets none. */
export const ACCENT = '#ffd84d';
/** A caption preset's text look: outline thickness (1 normal), neon glow colour, drop shadow. */
export type TextLook = { stroke?: number; glow?: string; shadow?: boolean };
