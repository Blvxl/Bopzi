import { isMusic, positions, type AudioClip, type Timeline } from './model';
import { findSound } from './sounds';
import { TRANSITION_SOUNDS } from './transitions';
import type { Effect } from './motion';

/**
 * Sound effects that ride on the edit itself, CapCut style: a whoosh with a zoom punch, a boom on a shake or flash, a
 * ding as a counter lands, a swish on a transition, a vine boom on a joke title. They belong to the effect, title or
 * cut they sound for, so they move with it and never fill the audio track. Pure: the preview plays the cues, the
 * export mixes the same cues in.
 */
export type Cue = { time: number; sound: string; file: string; volume: number; /** From the creator's own pack, not public/sounds. */ own?: boolean };

/** The sound new effects get when automatic sounds are on: what a creator would put there anyway. */
export function defaultSound(e: Effect): string | undefined {
  if (e.kind === 'zoom') return e.mode === 'hold' ? undefined : 'whoosh';
  if (e.kind === 'shake') return 'boom';
  if (e.kind === 'flash') return 'drama-boom';
  if (e.kind === 'counter') return 'ding';
  if (e.kind === 'highlight') return 'pop';
}

/** When an effect's sound hits: its start, or for a counter the moment it lands on its number. */
const hitOf = (e: Effect) => e.kind === 'counter' ? e.start + (e.countDelay ?? 0) + (e.countDuration ?? Math.max(.2, e.duration - .45)) : e.start;

export function soundCues(timeline: Timeline): Cue[] {
  const cues: Cue[] = [], hidden = (id: string) => timeline.layerSettings?.[id]?.hidden;
  const add = (time: number, sound: string | undefined, volume = .8) => { const s = findSound(sound); if (s) cues.push({ time, sound: s.id, file: s.file, volume, ...(s.own ? { own: true } : {}) }); };
  for (const e of timeline.effects) if (!hidden(e.id)) add(hitOf(e), e.sound);
  for (const t of timeline.titles) if (!hidden(t.id)) add(t.start, t.sound);
  // A transition's sound is centred on its cut, and starts a little early so the swish peaks there.
  for (const { clip, start } of positions(timeline)) if (clip.transition && !hidden(clip.id)) add(Math.max(0, start - clip.transition.duration / 3), clip.transition.sound === undefined ? TRANSITION_SOUNDS[clip.transition.kind] : clip.transition.sound ?? undefined, .6);
  return cues.sort((a, b) => a.time - b.time);
}

// ---- ducking: music drops while someone is speaking, judged from the captions
const DUCK = .3, RAMP = .2, JOIN = .5;
/** Shared edge fade envelope for the live preview and the rendered audio. */
export function fadeDurations(length: number, fadeIn: number, fadeOut = fadeIn): [number, number] {
  const scale = length > 0 ? Math.min(1, length / (fadeIn + fadeOut)) : 0;
  return [fadeIn * scale, fadeOut * scale];
}
export function fadeGain(elapsed: number, length: number, fadeIn: number, fadeOut = fadeIn) {
  const [inTime, outTime] = fadeDurations(length, fadeIn, fadeOut);
  if (length <= 0 || inTime <= 0 || outTime <= 0) return 0;
  return Math.max(0, Math.min(1, elapsed / inTime, (length - elapsed) / outTime));
}
/** The stretches with speech: captions closer than half a second are one stretch, so the music doesn't pump. */
export function speechSpans(timeline: Timeline) {
  const spans: [number, number][] = [];
  for (const c of [...timeline.captions].sort((a, b) => a.start - b.start)) {
    const last = spans.at(-1);
    if (last && c.start - last[1] < JOIN) last[1] = Math.max(last[1], c.start + c.duration); else spans.push([c.start, c.start + c.duration]);
  }
  return spans;
}
/** How loud music plays at a moment (1, or down to 0.3 under speech), easing over 0.2 s either side. */
export function duckGain(timeline: Timeline, audio: AudioClip, t: number, spans = speechSpans(timeline)) {
  if (timeline.duck === false || !isMusic(audio)) return 1;
  let near = 0;
  for (const [a, b] of spans) { if (t < a - RAMP) break; near = Math.max(near, t <= a ? 1 - (a - t) / RAMP : t <= b ? 1 : Math.max(0, 1 - (t - b) / RAMP)); }
  return 1 - (1 - DUCK) * near;
}
/** The same as an ffmpeg volume expression of timeline time `t`, for the export. */
export function duckExpression(timeline: Timeline, audio: AudioClip) {
  if (timeline.duck === false || !isMusic(audio)) return null;
  const spans = speechSpans(timeline); if (!spans.length) return null;
  const f = (n: number) => n.toFixed(3);
  // Each span's closeness: ramps up before it, holds through it, ramps down after; the loudest wins.
  const near = spans.slice(0, 200).map(([a, b]) => `clip(min((t-${f(a - RAMP)})/${RAMP},(${f(b + RAMP)}-t)/${RAMP}),0,1)`);
  const max = near.reduce((acc, n) => acc ? `max(${acc},${n})` : n, '');
  return `1-${(1 - DUCK).toFixed(2)}*${max}`;
}
