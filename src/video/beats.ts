import { isMusic, type Media, type Timeline } from './model';
import { audioSamples } from './media-source';

/**
 * Finds the beat in music, on this computer, like CapCut's beat markers. The song is decoded and low-passed so the kick
 * drum stands out; its loudness jumps ("onsets") are autocorrelated to find the tempo, a beat grid is lined up with the
 * onsets, and each beat is nudged onto the hit nearest to it. Every fourth beat in the strongest position is a bar
 * start: the "strong" beats that a punch or a cut lands best on.
 */
export type Beat = { time: number; strong: boolean };
const RATE = 11025, HOP = 128, FPS = RATE / HOP;
const found = new Map<string, Promise<{ bpm: number; beats: Beat[] } | null>>();

/** Beats in an audio file, in seconds of that file. Kept per file for the session, since a song never changes. */
export function songBeats(asset: Media) {
  let result = found.get(asset.id);
  if (!result) { result = analyse(asset).catch(() => null); found.set(asset.id, result); }
  return result;
}

async function analyse(asset: Media) {
  const samples = await audioSamples(asset, RATE); if (!samples?.length) return null;
  const decoded = new AudioBuffer({ length: samples.length, sampleRate: RATE, numberOfChannels: 1 }); decoded.copyToChannel(new Float32Array(samples), 0);
  // The low end through a filter: kicks and bass carry the beat; hats and vocals would blur it.
  const off = new OfflineAudioContext(1, decoded.length, decoded.sampleRate), src = off.createBufferSource(), low = off.createBiquadFilter();
  src.buffer = decoded; low.type = 'lowpass'; low.frequency.value = 160; src.connect(low).connect(off.destination); src.start();
  const kick = (await off.startRendering()).getChannelData(0), full = decoded.getChannelData(0);
  const frames = Math.floor(kick.length / HOP), onset = new Float32Array(frames);
  let prevK = 0, prevF = 0;
  for (let i = 0; i < frames; i++) {
    let k = 0, f = 0; for (let j = i * HOP; j < (i + 1) * HOP; j++) { k += kick[j] * kick[j]; f += full[j] * full[j]; }
    k = Math.sqrt(k / HOP); f = Math.sqrt(f / HOP);
    // Only rises count: a beat is where it suddenly gets louder. The kick counts double.
    onset[i] = 2 * Math.max(0, k - prevK) + Math.max(0, f - prevF); prevK = k; prevF = f;
  }
  const max = onset.reduce((m, v) => Math.max(m, v), 0); if (!max) return null;
  for (let i = 0; i < frames; i++) onset[i] /= max;
  // Tempo: the lag at which the onsets line up with themselves best, between 70 and 180 BPM, leaning towards 120.
  let best = 0, bestLag = Math.round(FPS * .5);
  for (let lag = Math.floor(FPS * 60 / 180); lag <= Math.ceil(FPS * 60 / 70); lag++) {
    let sum = 0; for (let i = lag; i < frames; i++) sum += onset[i] * onset[i - lag];
    const bpm = 60 * FPS / lag, prior = Math.exp(-.5 * (Math.log2(bpm / 120) / .9) ** 2), score = sum / (frames - lag) * prior;
    if (score > best) { best = score; bestLag = lag; }
  }
  // The lag is a whole number of frames, too coarse: 128 BPM would come out as 129 and the grid would drift a beat
  // every half minute. So the period is refined to a fraction of a frame, together with the phase (where on the grid
  // the hits fall), by finding the grid that lands on the most onset energy across the whole song.
  const at = (x: number) => { const i = Math.floor(x), f = x - i; return i + 1 < frames ? onset[i] * (1 - f) + onset[i + 1] * f : 0; };
  let period = bestLag, phase = 0, fit = -1;
  for (let p = bestLag - 1; p <= bestLag + 1; p += .02) {
    for (let ph = 0; ph < p; ph += .5) { let s = 0; for (let x = ph; x < frames - 1; x += p) s += at(x); if (s > fit) { fit = s; period = p; phase = ph; } }
  }
  const grid: { frame: number; weight: number }[] = [];
  // The grid also reaches back to the very start, so a song that opens on the beat has its first one marked.
  let first = phase; while (first - period > -1) first -= period;
  for (let x = Math.max(0, first); x < frames - 1; x += period) {
    // Each beat moves onto the strongest hit within a frame or so, so it lands on the drum rather than between.
    const i = Math.round(x); let hit = x, top = at(x);
    for (let d = -2; d <= 2; d++) { const j = i + d; if (j >= 0 && j < frames && onset[j] > top) { top = onset[j]; hit = j; } }
    grid.push({ frame: hit, weight: top });
  }
  // Bars of four: the position (1st, 2nd, 3rd or 4th beat) that hits hardest on average is the downbeat.
  const bars = [0, 1, 2, 3].map(r => grid.filter((_, i) => i % 4 === r).reduce((s, g) => s + g.weight, 0));
  const down = bars.indexOf(Math.max(...bars));
  return { bpm: Math.round(60 * FPS / period), beats: grid.map((g, i) => ({ time: g.frame / FPS, strong: i % 4 === down })) };
}

/** Every beat of every music clip, placed on the timeline (in timeline seconds), trims and all. */
export async function timelineBeats(timeline: Timeline, assets: Media[]) {
  const out: Beat[] = [];
  for (const a of timeline.audio) {
    if (!isMusic(a)) continue;
    const asset = assets.find(m => m.id === a.assetId); if (!asset) continue;
    const song = await songBeats(asset); if (!song) continue;
    for (const b of song.beats) if (b.time >= a.in && b.time < a.in + a.duration) out.push({ time: a.start + b.time - a.in, strong: b.strong });
  }
  return out.sort((x, y) => x.time - y.time);
}
