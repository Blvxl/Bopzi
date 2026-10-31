import { pictureAt } from './clip-motion';
import { clipLength, positions, uid, type Caption, type Media, type Mode, type Timeline } from './model';
import type { TranscribeReply, TranscribeRequest, Word } from './transcribe.worker';
import { joinTokens } from './tokens';
import { audioSamples } from './media-source';

const RATE = 16000;
let worker: Worker | null = null;
let seq = 0;
const decoded = new Map<string, Promise<Float32Array | null>>();

/** One asset's sound as 16 kHz mono, which is what Whisper listens to. Footage without sound gives null. */
export function speechOf(asset: Media) {
  let found = decoded.get(asset.id);
  if (!found) { found = audioSamples(asset, RATE).catch(() => null); decoded.set(asset.id, found); }
  return found;
}

/** The cut's own sound, laid out on the timeline: each clip's trimmed range at its speed. Music on the audio track is left out. */
async function timelineSpeech(timeline: Timeline, assets: Media[]) {
  const spots = positions(timeline); const total = spots.at(-1)?.end ?? 0;
  const out = new Float32Array(Math.ceil(total * RATE)); let heard = false;
  for (const { clip, start } of spots) {
    const asset = assets.find(a => a.id === clip.assetId);
    if (!asset || asset.kind !== 'video' || clip.volume === 0 || clip.freeze !== undefined) continue;
    // Footage on disk can be hours long: only the clip's own range is read.
    const base = asset.disk ? clip.in : 0;
    const source = asset.disk ? await audioSamples(asset, RATE, clip.in, clip.out).catch(() => null) : await speechOf(asset); if (!source) continue;
    const from = Math.floor(start * RATE), length = Math.floor(clipLength(clip) * RATE);
    for (let i = 0; i < length && from + i < out.length; i++) { const at = Math.floor((pictureAt(clip, i / RATE) - base) * RATE); if (at < 0) continue; if (at >= source.length) break; out[from + i] = source[at]; }
    heard = true;
  }
  return heard ? out : null;
}

export function listen(audio: Float32Array, onProgress?: (percent: number) => void) {
  worker ??= new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
  const w = worker; const id = ++seq;
  return new Promise<Word[]>((resolve, reject) => {
    const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
    const onMessage = (e: MessageEvent<TranscribeReply>) => {
      if (e.data.id !== id) return;
      if ('progress' in e.data) { onProgress?.(e.data.progress); return; }
      done();
      if ('error' in e.data) reject(new Error(e.data.error)); else resolve(e.data.words);
    };
    const onError = () => { done(); worker = null; w.terminate(); reject(new Error('Captions could not start in this browser.')); };
    w.addEventListener('message', onMessage); w.addEventListener('error', onError);
    w.postMessage({ id, audio } satisfies TranscribeRequest, [audio.buffer]);
  });
}

/** Shorts read best a few words at a time; longer videos can hold a phrase. */
const WORDS: Record<Mode, number> = { short: 3, trailer: 5, long: 7 };

/** Words into on-screen phrases: a new caption at a pause, after a sentence, or once the line is full. */
export function groupWords(words: Word[], mode: Mode): Caption[] {
  const captions: Caption[] = []; let line: Word[] = [];
  const flush = () => {
    if (!line.length) return; const start = line[0].start, end = Math.max(line.at(-1)!.end, start + .3);
    // Each word's own timing is kept, relative to the caption, so the word being said can light up.
    const words = line.map(w => w.text).join(' ').split(/\s+/).filter(Boolean).length === line.length ? line.map(w => ({ start: Math.max(0, w.start - start), end: Math.max(0, w.end - start) })) : undefined;
    captions.push({ id: uid(), text: line.map(w => w.text).join(' '), start, duration: end - start, ...(words ? { words } : {}) }); line = [];
  };
  for (const word of words) {
    const last = line.at(-1);
    // A full line still takes the one word that ends its sentence, so no caption is a lone "left."
    const full = line.length >= WORDS[mode] && !(line.length === WORDS[mode] && /[.!?]$/.test(word.text));
    if (last && (word.start - last.end > .6 || full || /[.!?]$/.test(last.text) || word.end - line[0].start > 3)) flush();
    line.push(word);
  }
  flush();
  // Each caption stays up until the next one starts, but never overlaps it.
  captions.forEach((c, i) => { const next = captions[i + 1]; if (next) c.duration = Math.max(.05, Math.min(next.start - c.start, c.duration + .4)); });
  return captions;
}

/** Captions for everything said in the cut. `onProgress` reports the one-time model download, 0 to 100. */
export async function makeCaptions(timeline: Timeline, assets: Media[], onProgress?: (percent: number) => void) {
  const audio = await timelineSpeech(timeline, assets);
  if (!audio) throw new Error('No clip in this cut has sound to caption. Add gameplay with voice or commentary.');
  const words = await listen(audio, onProgress);
  if (!words.length) throw new Error('No speech was heard in this cut.');
  return groupWords(joinTokens(words), timeline.mode);
}
