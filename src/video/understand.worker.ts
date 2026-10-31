import { AutoModelForXVector, AutoProcessor, RawImage, pipeline } from '@huggingface/transformers';

/**
 * Footage understanding, off the main thread and on this computer: who is speaking (voice fingerprints), what can be
 * heard besides speech (laughter, cheering…) and where people are in the frame. Models are fetched from Hugging Face
 * the first time and kept by the browser; the footage itself never leaves this computer.
 */
export type UnderstandRequest =
  | { id: number; task: 'speakers'; audio: Float32Array; segments: [number, number][] }
  | { id: number; task: 'events'; audio: Float32Array; windows: [number, number][] }
  | { id: number; task: 'people'; frames: { data: Uint8ClampedArray; width: number; height: number }[] };
export type PersonBox = { x: number; y: number; w: number; h: number; score: number };
export type UnderstandReply =
  | { id: number; speakers: number[] }
  | { id: number; events: { label: string; score: number }[][] }
  | { id: number; people: PersonBox[][] }
  | { id: number; progress: number }
  | { id: number; error: string }
  | { id: 0; info: string };

const RATE = 16000;
const device = () => ('gpu' in navigator ? 'webgpu' : 'wasm') as 'webgpu' | 'wasm';
/** Loads on the graphics card when it can, else the CPU, and says which: a model silently on the CPU is the usual reason this gets slow. */
async function onBest<T>(name: string, make: (device: 'webgpu' | 'wasm') => Promise<T>) {
  if (device() === 'webgpu') { try { const m = await make('webgpu'); postMessage({ id: 0, info: `${name} runs on the graphics card` } satisfies UnderstandReply); return m; } catch (e) { postMessage({ id: 0, info: `${name} could not use the graphics card (${e instanceof Error ? e.message : e}); using the CPU` } satisfies UnderstandReply); } }
  const m = await make('wasm'); postMessage({ id: 0, info: `${name} runs on the CPU` } satisfies UnderstandReply); return m;
}

type Loaded<T> = Promise<T> | null;
let voice: Loaded<{ processor: (audio: Float32Array) => Promise<Record<string, unknown>>; model: (inputs: Record<string, unknown>) => Promise<{ embeddings: { data: Float32Array; dims: number[] } }> }> = null;
let hearing: Loaded<(audio: Float32Array, options: Record<string, unknown>) => Promise<{ label: string; score: number }[]>> = null;
let seeing: Loaded<(image: RawImage, options: Record<string, unknown>) => Promise<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }[]>> = null;

/** A failed download must not stick: the next try starts again. */
function once<T>(get: () => Loaded<T>, set: (v: Loaded<T>) => void, make: () => Promise<T>) {
  const found = get(); if (found) return found;
  const next = make().catch((e) => { set(null); throw e; }); set(next); return next;
}
const loadVoice = () => once(() => voice, (v) => (voice = v), async () => {
  const id = 'Xenova/wavlm-base-plus-sv';
  const model = onBest('Voice model', d => AutoModelForXVector.from_pretrained(id, { dtype: d === 'webgpu' ? 'fp32' : 'q8', device: d }));
  const [processor, loaded] = await Promise.all([AutoProcessor.from_pretrained(id), model]);
  return { processor: processor as never, model: loaded as never };
});
// AST always listens to 10-second windows; the graphics card makes each one take a fraction of a second.
const loadHearing = () => once(() => hearing, (v) => (hearing = v), async () => {
  const id = 'Xenova/ast-finetuned-audioset-10-10-0.4593';
  return onBest('Sound tagger', d => pipeline('audio-classification', id, { dtype: d === 'webgpu' ? 'fp32' : 'q8', device: d })) as never;
});
const loadSeeing = () => once(() => seeing, (v) => (seeing = v), async () =>
  onBest('Person detector', d => pipeline('object-detection', 'Xenova/yolos-tiny', { dtype: d === 'webgpu' ? 'fp32' : 'q8', device: d })) as never);

const cosine = (a: Float32Array, b: Float32Array) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };

/**
 * One voice fingerprint per phrase, then grouped: a phrase joins the closest voice heard so far when it is similar
 * enough, otherwise it is a new speaker. Short phrases give weak fingerprints, so they take their neighbour's speaker.
 */
async function speakers(id: number, audio: Float32Array, segments: [number, number][]) {
  const { processor, model } = await loadVoice();
  const voices: { sum: Float32Array; n: number }[] = [], labels: number[] = [];
  for (const [i, [a, b]] of segments.entries()) {
    postMessage({ id, progress: Math.round(100 * i / segments.length) } satisfies UnderstandReply);
    if (b - a < .7) { labels.push(-1); continue; }
    const clip = audio.subarray(Math.floor(a * RATE), Math.min(audio.length, Math.ceil(Math.min(b, a + 8) * RATE)));
    const { embeddings } = await model(await processor(clip));
    const e = new Float32Array(embeddings.data);
    let best = -1, score = 0;
    voices.forEach((v, k) => { const s = cosine(e, v.sum.map(x => x / v.n)); if (s > score) { score = s; best = k; } });
    if (best >= 0 && score > .72) { const v = voices[best]; for (let j = 0; j < e.length; j++) v.sum[j] += e[j]; v.n++; labels.push(best); }
    else { voices.push({ sum: e, n: 1 }); labels.push(voices.length - 1); }
  }
  // A "speaker" heard for under three seconds in all is almost always one odd phrase of someone else: fold it into its neighbour.
  const talk = new Map<number, number>(); segments.forEach(([a, b], i) => { if (labels[i] >= 0) talk.set(labels[i], (talk.get(labels[i]) ?? 0) + b - a); });
  const real = [...talk.entries()].filter(([, s]) => s >= 3).map(([l]) => l);
  if (real.length) labels.forEach((l, i) => { if (l >= 0 && !real.includes(l)) labels[i] = -1; });
  // Fill short phrases from the nearest labelled one.
  for (let i = 0; i < labels.length; i++) if (labels[i] < 0) labels[i] = labels.slice(0, i).reverse().find(l => l >= 0) ?? labels.slice(i).find(l => l >= 0) ?? 0;
  return labels;
}

async function events(id: number, audio: Float32Array, windows: [number, number][]) {
  const classify = await loadHearing(), out: { label: string; score: number }[][] = [];
  for (const [i, [a, b]] of windows.entries()) {
    postMessage({ id, progress: Math.round(100 * i / windows.length) } satisfies UnderstandReply);
    const all = await classify(audio.slice(Math.floor(a * RATE), Math.ceil(b * RATE)), { top_k: 120 });
    // The top tags, plus reactions even when talking drowns them out of the top: a short laugh in a 10-second window scores low.
    const scores = [...all.slice(0, 6), ...all.slice(6).filter(s => /laugh|giggle|chuckle|cheer|applause|scream|shout|yell|gasp/i.test(s.label) && s.score > .02)];
    // The top tags of every window go back; which ones matter is decided by the caller.
    out.push(scores.map(s => ({ label: s.label, score: Number(s.score.toFixed(3)) })));
  }
  return out;
}

async function people(id: number, frames: { data: Uint8ClampedArray; width: number; height: number }[]) {
  const detect = await loadSeeing(), out: PersonBox[][] = [];
  for (const [i, f] of frames.entries()) {
    postMessage({ id, progress: Math.round(100 * i / frames.length) } satisfies UnderstandReply);
    const found = await detect(new RawImage(f.data, f.width, f.height, 4), { threshold: .6, percentage: true });
    out.push(found.filter(d => d.label === 'person').map(d => ({ x: (d.box.xmin + d.box.xmax) / 2, y: (d.box.ymin + d.box.ymax) / 2, w: d.box.xmax - d.box.xmin, h: d.box.ymax - d.box.ymin, score: d.score })));
  }
  return out;
}

// One job at a time: on a laptop graphics chip, models running side by side each slow down several times over.
let queue: Promise<void> = Promise.resolve();
addEventListener('message', (e: MessageEvent<UnderstandRequest>) => {
  const job = e.data;
  queue = queue.then(async () => {
    try {
      if (job.task === 'speakers') postMessage({ id: job.id, speakers: await speakers(job.id, job.audio, job.segments) } satisfies UnderstandReply);
      else if (job.task === 'events') postMessage({ id: job.id, events: await events(job.id, job.audio, job.windows) } satisfies UnderstandReply);
      else postMessage({ id: job.id, people: await people(job.id, job.frames) } satisfies UnderstandReply);
    } catch (err) {
      postMessage({ id: job.id, error: err instanceof Error ? err.message : 'The footage could not be analysed.' } satisfies UnderstandReply);
    }
  });
});