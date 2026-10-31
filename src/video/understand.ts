import { loudness } from './ai-context';
import type { Media } from './model';
import { seek } from './track';
import { listen, speechOf } from './transcribe';
import { joinTokens } from './tokens';
import { readableUrl } from './media-source';
export { joinTokens };
import type { PersonBox, UnderstandReply, UnderstandRequest } from './understand.worker';

/**
 * What Bopzi knows about one video, worked out once on this computer and kept: everything said and by whom, the quiet
 * stretches, sounds like laughter, the shots and who is in them. All times are the video's own (source) seconds, the
 * same seconds a clip's in/out use, so the edit AI can cut on them directly.
 */
export type Phrase = { start: number; end: number; speaker: number; text: string };
export type SoundEvent = { label: string; start: number; end: number; score: number };
export type Shot = { start: number; end: number; people: PersonBox[]; description?: string };
export type FootageIndex = { key: string; assetId: string; duration: number; phrases: Phrase[]; words: { t: number; e: number; w: string }[]; speakers: number; silences: [number, number][]; sounds: SoundEvent[]; shots: Shot[]; done: string[]; /** Seconds each step took, to keep the analysis fast. */ timings?: Record<string, number>; /** Names given to speakers by hand, by speaker number. */ speakerNames?: string[]; /** Every step has run (some may have found nothing). */ complete?: boolean; /** While only part of the speech is transcribed: which source seconds. */ heard?: [number, number]; /** The top sound tags of each 10-second window, for the curious and for debugging. */ tags?: { start: number; end: number; top: { label: string; score: number }[] }[] };
export type Progress = { stage: string; percent: number };

const VERSION = 1, RATE = 16000;
const keyOf = (asset: Media) => `${asset.id}:${asset.duration.toFixed(2)}:v${VERSION}`;

// ---- storage: one small database of its own, so the project database never needs a migration for this ----
let db: Promise<IDBDatabase> | undefined;
function open() {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('bopzi-footage', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('index', { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result); req.onerror = () => { db = undefined; reject(req.error); };
  });
  return db;
}
async function load(key: string) { try { const d = await open(); return await new Promise<FootageIndex | undefined>(r => { const q = d.transaction('index').objectStore('index').get(key); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); } catch { return undefined; } }
async function store(index: FootageIndex) { try { const d = await open(); d.transaction('index', 'readwrite').objectStore('index').put(index); } catch { /* not kept: worked out again next time */ } }

// ---- the worker ----
let worker: Worker | null = null, seq = 0;
type Job = UnderstandRequest extends infer R ? R extends UnderstandRequest ? Omit<R, 'id'> : never : never;
function ask<T>(job: Job, pick: (r: UnderstandReply) => T | undefined, onProgress: (p: number) => void, transfer: Transferable[] = []) {
  if (!worker) {
    worker = new Worker(new URL('./understand.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<UnderstandReply>) => { if ('info' in e.data) console.info('[understand]', e.data.info); });
  }
  const w = worker, id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
    const onMessage = (e: MessageEvent<UnderstandReply>) => {
      if (e.data.id !== id) return;
      if ('progress' in e.data) { onProgress(e.data.progress); return; }
      done();
      if ('error' in e.data) reject(new Error(e.data.error)); else { const v = pick(e.data); if (v === undefined) reject(new Error('Unexpected reply.')); else resolve(v); }
    };
    const onError = () => { done(); worker = null; w.terminate(); reject(new Error('Footage analysis could not start in this browser.')); };
    w.addEventListener('message', onMessage); w.addEventListener('error', onError);
    w.postMessage({ ...job, id } as UnderstandRequest, transfer);
  });
}

// ---- the parts ----
/** Words into phrases: a new phrase at a pause, a sentence end, or after six seconds. */
function phrasesOf(words: { start: number; end: number; text: string }[]) {
  const out: { start: number; end: number; text: string }[] = [];
  for (const w of words) {
    const last = out.at(-1);
    if (last && w.start - last.end < .5 && !/[.!?]$/.test(last.text) && w.end - last.start < 6) { last.end = w.end; last.text += ' ' + w.text; }
    else out.push({ start: w.start, end: w.end, text: w.text });
  }
  return out;
}
/** Quiet stretches of at least .6 s, from the loudness Bopzi already measures (a value per quarter second). */
function silencesOf(db: number[]) {
  const sorted = [...db].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] ?? -60;
  const floor = Math.max(-55, Math.min(-42, median - 14)), out: [number, number][] = [];
  let from = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i] < floor;
    if (quiet && from < 0) from = i;
    else if (!quiet && from >= 0) { if ((i - from) * .25 >= .6) out.push([from * .25, i * .25]); from = -1; }
  }
  return out;
}
const LAUGH = /laugh|giggle|chuckle/i;
/** AudioSet tags worth telling the editor about; speech itself comes from the transcript. */
const SOUNDS = /laugh|giggle|chuckle|cheer|applause|scream|shout|yell|gasp|explosion|gunshot|music/i;
/**
 * Sound tags per 10-second window (windows overlap by half) into events like "laughter 12.0–14.5". A quarter-second
 * slot carries a sound only when every window covering it heard that sound, which narrows each event to about five
 * seconds; the loud part inside it (laughs and cheers are louder than talk) then narrows it further.
 */
function soundsOf(windows: [number, number][], tags: { label: string; score: number }[][], db: number[] | null, duration: number) {
  const slots = Math.ceil(duration / .25), out: SoundEvent[] = [];
  const sorted = db ? [...db].sort((a, b) => a - b) : [], loudFloor = (sorted[Math.floor(sorted.length / 2)] ?? -30) + 4;
  const labels = new Set(tags.flat().filter(t => SOUNDS.test(t.label) && t.score > .04).map(t => LAUGH.test(t.label) ? 'laughter' : t.label.toLowerCase().replace(/,.*$/, '')));
  for (const label of labels) {
    const score = (i: number) => Math.max(0, ...(tags[i] ?? []).filter(t => (LAUGH.test(t.label) ? 'laughter' : t.label.toLowerCase().replace(/,.*$/, '')) === label).map(t => t.score));
    const heard = Array.from({ length: slots }, (_, s) => {
      const at = s * .25 + .125, covering = windows.map((w, i) => ({ w, i })).filter(({ w }) => at >= w[0] && at < w[1]);
      return covering.length > 0 && covering.every(({ i }) => score(i) > (label === 'laughter' ? .05 : label === 'music' ? .25 : .08)) ? Math.max(...covering.map(({ i }) => score(i))) : 0;
    });
    for (let s = 0; s < slots; s++) {
      if (!heard[s]) continue;
      let e = s; while (e + 1 < slots && heard[e + 1]) e++;
      let a = s, b = e;
      if (db) { const loud = []; for (let k = s; k <= e; k++) if ((db[k] ?? -99) > loudFloor) loud.push(k); if (loud.length) { a = loud[0]; b = loud.at(-1)!; } }
      if ((b - a + 1) * .25 < 1) { const mid = (a + b) / 2; a = Math.max(s, Math.floor(mid - 2)); b = Math.min(e, Math.ceil(mid + 2)); }
      out.push({ label, start: Number((a * .25).toFixed(2)), end: Number(((b + 1) * .25).toFixed(2)), score: Number(Math.max(...heard.slice(s, e + 1)).toFixed(2)) });
      s = e;
    }
  }
  return out.sort((x, y) => x.start - y.start);
}
const FRAME_W = 320, FRAME_H = 180;
/** Frames once a second (at most 150), small, for finding cuts and people. */
async function framesOf(asset: Media, onProgress: (p: number) => void) {
  // Its own element on its own URL: the editor revokes and remakes its URLs, and this can run for minutes.
  const { url, release } = readableUrl(asset);
  const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
    const el = Object.assign(document.createElement('video'), { muted: true, preload: 'auto', playsInline: true });
    el.addEventListener('loadeddata', () => resolve(el), { once: true });
    el.addEventListener('error', () => reject(new Error(`${asset.name} could not be opened.`)), { once: true });
    el.src = url;
  }).catch(e => { release(); throw e; });
  const step = Math.max(1, asset.duration / 150), times: number[] = [];
  for (let t = Math.min(.2, asset.duration / 2); t < asset.duration; t += step) times.push(t);
  const canvas = Object.assign(document.createElement('canvas'), { width: FRAME_W, height: FRAME_H }), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const draw = () => {
    const scale = Math.min(FRAME_W / video.videoWidth, FRAME_H / video.videoHeight) || 1, w = video.videoWidth * scale, h = video.videoHeight * scale;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, FRAME_W, FRAME_H); ctx.drawImage(video, (FRAME_W - w) / 2, (FRAME_H - h) / 2, w, h);
    return ctx.getImageData(0, 0, FRAME_W, FRAME_H);
  };
  const grab = async (t: number) => { await Promise.race([seek(video, Math.min(t, asset.duration - .05)), new Promise(r => setTimeout(r, 3000))]); return draw(); };
  const frames: { t: number; image: ImageData }[] = [];
  // Fast path: play it muted at 8x and take each frame as it goes by; decoding in order is far quicker than a
  // hundred seeks. The element sits in the page (invisible), since browsers only hand out frames of shown video.
  if ('requestVideoFrameCallback' in video) {
    Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(video);
    await new Promise<void>(resolve => {
      let next = 0, lastFrame = Date.now(), done = false;
      const finish = () => { if (done) return; done = true; clearInterval(watchdog); video.pause(); resolve(); };
      // A hidden tab stops handing out frames: give up on playback and let seeking fill in the rest.
      const watchdog = setInterval(() => { if (Date.now() - lastFrame > 4000) finish(); }, 1000);
      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        lastFrame = Date.now();
        if (next < times.length && meta.mediaTime >= times[next] - step / 2) {
          frames.push({ t: meta.mediaTime, image: draw() });
          while (next < times.length && times[next] - step / 2 <= meta.mediaTime) next++;
          onProgress(Math.round(100 * next / times.length));
        }
        if (next >= times.length || video.ended) finish(); else video.requestVideoFrameCallback(onFrame);
      };
      video.addEventListener('ended', finish, { once: true });
      video.playbackRate = 8;
      video.requestVideoFrameCallback(onFrame);
      void video.play().catch(finish);
    });
    video.remove(); video.playbackRate = 1;
  }
  // Whatever playback missed, by seeking.
  for (const t of times) if (!frames.some(f => Math.abs(f.t - t) <= step * .75)) frames.push({ t, image: await grab(t) });
  frames.sort((x, y) => x.t - y.t);  return Object.assign(frames, { grab, release: () => { video.removeAttribute('src'); video.load(); release(); } });
}
/** How different two frames look: mean brightness change over a coarse grid, 0–1. */
function difference(a: ImageData, b: ImageData) {
  let sum = 0, n = 0;
  for (let y = 4; y < FRAME_H; y += 9) for (let x = 4; x < FRAME_W; x += 9) {
    const i = (y * FRAME_W + x) * 4, la = a.data[i] * .3 + a.data[i + 1] * .59 + a.data[i + 2] * .11, lb = b.data[i] * .3 + b.data[i + 1] * .59 + b.data[i + 2] * .11;
    sum += Math.abs(la - lb); n++;
  }
  return sum / n / 255;
}
/** Shot changes where neighbouring frames differ a lot, sharpened to a tenth of a second by looking in between. */
async function shotsOf(frames: { t: number; image: ImageData }[] & { grab?: (t: number) => Promise<ImageData> }, duration: number) {
  const cuts: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    if (difference(frames[i - 1].image, frames[i].image) < .16) continue;
    let lo = frames[i - 1].t, hi = frames[i].t, loImg = frames[i - 1].image;
    while (hi - lo > .12 && frames.grab) { const mid = (lo + hi) / 2, img = await frames.grab(mid); if (difference(loImg, img) > .12) hi = mid; else { lo = mid; loImg = img; } }
    cuts.push(Number(hi.toFixed(2)));
  }
  const bounds = [0, ...cuts, duration];
  return bounds.slice(0, -1).map((start, i) => ({ start, end: bounds[i + 1] })).filter(s => s.end - s.start > .2);
}

/** People in a shot: the boxes seen in most of its frames, averaged where they line up. */
function peopleOf(boxes: PersonBox[][]) {
  const seen = boxes.filter(b => b.length); if (!seen.length) return [];
  const count = Math.round(seen.map(b => b.length).sort((a, b) => a - b)[Math.floor(seen.length / 2)]);
  const ref = seen.find(b => b.length === count) ?? seen[0];
  // The detector sometimes boxes one person twice; boxes whose centres nearly match are the same person.
  const distinct = ref.filter((p, i) => !ref.slice(0, i).some(q => Math.abs(q.x - p.x) < .08 && Math.abs(q.y - p.y) < .12));
  return distinct.slice(0, 6).sort((a, b) => a.x - b.x).map(p => {
    const near = seen.flatMap(b => b.filter(q => Math.abs(q.x - p.x) < .12));
    const avg = (k: keyof PersonBox) => Number((near.reduce((s, q) => s + q[k], 0) / near.length).toFixed(3));
    return { x: avg('x'), y: avg('y'), w: avg('w'), h: avg('h'), score: avg('score') };
  });
}

async function describe(asset: Media, shots: Shot[], phrases: Phrase[], frames: { t: number; image: ImageData }[], model?: { model?: string; effort?: string }) {
  const pick = shots.slice(0, 24).map(s => frames.reduce((best, f) => Math.abs(f.t - (s.start + s.end) / 2) < Math.abs(best.t - (s.start + s.end) / 2) ? f : best, frames[0]));
  const canvas = Object.assign(document.createElement('canvas'), { width: FRAME_W, height: FRAME_H }), ctx = canvas.getContext('2d')!;
  const images = pick.map(f => { ctx.putImageData(f.image, 0, 0); return canvas.toDataURL('image/jpeg', .7); });
  const response = await fetch('/api/video/describe-shots', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({
    name: asset.name, ...model,
    shots: shots.slice(0, 24).map((s, i) => ({ start: s.start, end: s.end, image: images[i], people: s.people.length, said: phrases.filter(p => p.end > s.start && p.start < s.end).map(p => `S${p.speaker + 1}: ${p.text}`).join(' ').slice(0, 300) })),
  }) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body?.descriptions)) throw new Error(body?.error || 'The shots could not be described.');
  return body.descriptions as string[];
}

// ---- the whole job ----
const running = new Map<string, Promise<FootageIndex | null>>(), listeners = new Map<string, Set<(p: Progress) => void>>();
/** The index for one video: from the cache, or worked out now. Steps that fail are skipped; the rest still helps. */
export function understand(asset: Media, listener: (p: Progress) => void = () => {}, model?: { model?: string; effort?: string }, focus?: [number, number]) {
  if (asset.kind !== 'video') return Promise.resolve(null);
  // Everyone waiting on this video hears its progress, including a caller that joins a job already under way.
  const key = keyOf(asset), heard = listeners.get(key) ?? new Set(); heard.add(listener); listeners.set(key, heard);
  const going = running.get(key); if (going) return going.finally(() => heard.delete(listener));
  const onProgress = (p: Progress) => { for (const l of heard) l(p); };
  const job = (async () => {
    const cached = await load(key);
    if (cached?.complete) return cached;
    const index: FootageIndex = cached ?? { key, assetId: asset.id, duration: asset.duration, phrases: [], words: [], speakers: 0, silences: [], sounds: [], shots: [], done: [] };
    const STAGES: Record<string, string> = { silences: 'Measuring the quiet parts', 'transcript-focus': 'Listening to your cut', 'speakers-focus': 'Telling the voices apart', transcript: 'Listening to the rest', speakers: 'Telling the voices apart', sounds: 'Listening for laughs', shots: 'Watching the footage', people: 'Finding the people', descriptions: 'Describing each shot' };
    // Audio and video are worked out side by side, so the progress line shows whatever is running right now.
    const active = new Map<string, number>();
    const report = () => { if (active.size) onProgress({ stage: [...active.keys()].map(k => STAGES[k] ?? k).join(' · '), percent: [...active.values()].reduce((s, v) => s + v, 0) / active.size }); };
    const progress = (name: string) => (p: number) => { if (active.has(name)) { active.set(name, p); report(); } };
    const step = async (name: string, run: () => Promise<void>) => {
      if (index.done.includes(name)) return;
      active.set(name, 0); report();
      const started = performance.now();
      try { await run(); index.done.push(name); } catch (e) { console.warn(`[understand] ${name} skipped:`, e); }
      active.delete(name); report();
      (index.timings ??= {})[name] = Number(((performance.now() - started) / 1000).toFixed(1)); await store(index);
    };
    const started = performance.now();
    // One graphics card: Whisper goes first (speech matters most), the other models queue behind it. Grabbing frames
    // is video decoding, not the graphics card's model work, so it runs alongside from the start.
    let gpuFree!: () => void; const afterSpeech = new Promise<void>(r => { gpuFree = r; });
    // Laughs come last: edits lean on who is where more often than on reactions.
    let peopleFound!: () => void; const afterPeople = new Promise<void>(r => { peopleFound = r; });
    const listening = (async () => {
      const audio = await speechOf(asset);
      if (!audio) gpuFree();
      await step('silences', async () => { const db = await loudness(asset); if (db) index.silences = silencesOf(db); });
      if (!audio) return;
      /** Who says each phrase: voice fingerprints, numbered in the order people first talk. */
      const labelSpeakers = async (name: string) => {
        if (!index.phrases.length) return;
        const labels = await ask({ task: 'speakers', audio: audio.slice(), segments: index.phrases.map(p => [p.start, p.end] as [number, number]) }, r => 'speakers' in r ? r.speakers : undefined, progress(name));
        const order: number[] = []; for (const l of labels) if (!order.includes(l)) order.push(l);
        index.phrases.forEach((p, i) => { p.speaker = order.indexOf(labels[i]); }); index.speakers = order.length;
      };
      const keepWords = (heard: { start: number; end: number; text: string }[]) => {
        const words = joinTokens(heard);
        index.words = words.map(w => ({ t: Number(w.start.toFixed(2)), e: Number(w.end.toFixed(2)), w: w.text }));
        index.phrases = phrasesOf(words).map(p => ({ ...p, speaker: 0 }));
      };
      const speech = (async () => {
        // The part on the timeline first, so edits on a short cut can use what is said within seconds of upload;
        // the whole file follows (a later cut may use any of it).
        if (focus && !index.done.includes('transcript') && focus[1] - focus[0] < asset.duration * .6) {
          const [a, b] = [Math.max(0, focus[0]), Math.min(asset.duration, focus[1])];
          await step('transcript-focus', async () => {
            const words = await listen(audio.slice(Math.floor(a * RATE), Math.ceil(b * RATE)), progress('transcript-focus'));
            keepWords(words.map(w => ({ ...w, start: w.start + a, end: w.end + a }))); index.heard = [a, b];
          });
          await step('speakers-focus', () => labelSpeakers('speakers-focus'));
        }
        await step('transcript', async () => { keepWords(await listen(audio.slice(), progress('transcript'))); delete index.heard; });
        gpuFree();
        await step('speakers', () => labelSpeakers('speakers'));
      })();      const reactions = afterSpeech.then(() => afterPeople).then(() => step('sounds', async () => {
        // AST hears 10-second windows; half-overlapping ones let soundsOf narrow down where each sound is.
        const windows: [number, number][] = [];
        for (let a = 0; a < asset.duration && windows.length < 120; a += 5) windows.push([a, Math.min(asset.duration, a + 10)]);
        const tags = await ask({ task: 'events', audio: audio.slice(), windows }, r => 'events' in r ? r.events : undefined, progress('sounds'));
        index.sounds = soundsOf(windows, tags, await loudness(asset), asset.duration);
        index.tags = windows.map(([a, b], i) => ({ start: a, end: b, top: (tags[i] ?? []).slice(0, 8) }));
      }));
      await Promise.all([speech, reactions]);
    })();
    let frames: { t: number; image: ImageData }[] & { release?: () => void } = [];
    const watching = (async () => {
      await step('shots', async () => {
        frames = await framesOf(asset, progress('shots'));
        if (!frames.length) return;
        index.shots = (await shotsOf(frames, asset.duration)).map(s => ({ ...s, people: [] }));
      });
      await afterSpeech;
      await step('people', async () => {
        if (!frames.length) frames = await framesOf(asset, progress('people'));
        // The middle frame of a short shot is enough; a long one gets three, since people may move or come and go.
        const picked = index.shots.map(s => { const inShot = frames.filter(f => f.t >= s.start && f.t < s.end); if (!inShot.length) return []; return s.end - s.start < 8 ? [inShot[Math.floor(inShot.length / 2)]] : [.15, .5, .85].map(k => inShot[Math.round(k * (inShot.length - 1))]); });
        const flat = picked.flat(), sample = flat.map(f => ({ data: new Uint8ClampedArray(f.image.data), width: FRAME_W, height: FRAME_H }));
        const boxes = await ask({ task: 'people', frames: sample }, r => 'people' in r ? r.people : undefined, progress('people'), sample.map(f => f.data.buffer));
        let k = 0; index.shots.forEach((s, i) => { s.people = peopleOf(picked[i].map(() => boxes[k++] ?? [])); });
      });
      peopleFound();
    })();
    // Whatever happens above, nothing may be left waiting on a gate that never opens.
    await Promise.allSettled([listening.finally(() => gpuFree()), watching.finally(() => peopleFound())]);
    // Descriptions read what is said in each shot, so they come once both halves are in.
    await step('descriptions', async () => {
      if (!index.shots.length) return;
      if (!frames.length) frames = await framesOf(asset, progress('descriptions'));
      const d = await describe(asset, index.shots, index.phrases, frames, model);
      index.shots.forEach((s, i) => { if (d[i]) s.description = d[i]; });
    });
    frames.release?.();
    index.complete = true; (index.timings ??= {}).total = Number(((performance.now() - started) / 1000).toFixed(1));
    await store(index);
    return index;  })().catch(e => { console.warn('[understand] failed:', e); return null; }).finally(() => { running.delete(key); listeners.delete(key); });
  running.set(key, job);
  return job;
}
/** A finished index without starting any work, for building a request right away. */
export const knownIndex = (asset: Media) => asset.kind === 'video' ? load(keyOf(asset)) : Promise.resolve(undefined);

/**
 * A word the speech model got wrong, fixed by hand: the first piece takes the new text, any other pieces of the same
 * word go, and the phrases are rewritten from their words. Kept with the index, so every later edit hears the fix.
 */
export async function fixWord(index: FootageIndex, pieces: number[], text: string) {
  const next: FootageIndex = { ...index, words: index.words.map((w, i) => i === pieces[0] ? { ...w, w: text.trim() } : w).filter((_, i) => !pieces.slice(1).includes(i) && !(i === pieces[0] && !text.trim())) };
  next.phrases = index.phrases.map(p => ({ ...p, text: joinTokens(next.words.filter(w => w.t >= p.start - .05 && w.t <= p.end + .05).map(w => ({ start: w.t, end: w.e, text: w.w }))).map(w => w.text).join(' ') })).filter(p => p.text);
  await store(next);
  return next;
}
/** Names for the speakers ("Kai" instead of Speaker 2), kept with the index and told to the edit AI. */
export async function nameSpeaker(index: FootageIndex, speaker: number, name: string) {
  const names = [...(index.speakerNames ?? [])]; names[speaker] = name.trim().slice(0, 40);
  const next = { ...index, speakerNames: names };
  await store(next);
  return next;
}

const f1 = (n: number) => n.toFixed(1);
const box = (p: PersonBox) => `x${p.x.toFixed(2)} y${p.y.toFixed(2)} w${p.w.toFixed(2)} h${p.h.toFixed(2)}`;
/** The index as compact text for the edit AI, in source seconds, bounded so a long video never floods the request. */
export function describeIndex(index: FootageIndex, ref: string, budget = 12000) {
  const lines: string[] = [`${ref} (${f1(index.duration)}s):`];
  // Edits can start before the analysis ends: say what is still missing, so a gap is not read as "nothing there".
  const pending = ['transcript', 'speakers', 'sounds', 'shots', 'people', 'descriptions'].filter(s => !index.done.includes(s));
  if (!index.complete && pending.length) lines.push(`STILL BEING ANALYSED: ${pending.join(', ')}. Anything missing below is unknown, not absent; use the contact sheets for it.`);
  if (index.shots.length) lines.push('SHOTS:', ...index.shots.slice(0, 40).map((s, i) => `  #${i + 1} ${f1(s.start)}–${f1(s.end)}s${s.description ? ` ${s.description}` : ''}${!index.done.includes('people') ? '' : s.people.length ? ` | people (left to right): ${s.people.map((p, k) => `P${k + 1}[${box(p)}]`).join(' ')}` : ' | no people detected'}`));
  if (index.phrases.length) {
    lines.push(`SPEECH (${index.speakers || 1} speaker${index.speakers === 1 ? '' : 's'}; S1 talks first${index.heard ? `; only ${f1(index.heard[0])}–${f1(index.heard[1])}s transcribed so far` : ''}):`);
    const named = (index.speakerNames ?? []).map((n, i) => n ? `S${i + 1} is ${n}` : '').filter(Boolean);
    if (named.length) lines.push(`SPEAKER NAMES (given by the user): ${named.join('; ')}.`);
    let used = lines.join('\n').length;
    for (const p of index.phrases) { const line = `  ${f1(p.start)}–${f1(p.end)} S${p.speaker + 1}: ${p.text}`; if (used + line.length > budget * .7) { lines.push('  …(rest left out)'); break; } lines.push(line); used += line.length; }
    const fillers = index.words.filter(w => /^(um+|uh+|erm|like|you know)[,.]?$/i.test(w.w)).slice(0, 40);
    if (fillers.length) lines.push(`FILLER WORDS: ${fillers.map(w => `"${w.w}"@${f1(w.t)}–${f1(w.e)}`).join(', ')}`);
  } else if (index.done.includes('transcript')) lines.push('SPEECH: none heard.');
  if (index.done.includes('silences')) lines.push(`SILENCES (≥.6s): ${index.silences.length ? index.silences.slice(0, 60).map(([a, b]) => `${f1(a)}–${f1(b)}`).join(', ') : 'none'}`);
  if (index.done.includes('sounds')) lines.push(`SOUNDS: ${index.sounds.length ? index.sounds.slice(0, 40).map(e => `${e.label} ${f1(e.start)}–${f1(e.end)} (${Math.round(e.score * 100)}%)`).join(', ') : 'nothing besides speech'}`);
  return lines.join('\n').slice(0, budget);
}
