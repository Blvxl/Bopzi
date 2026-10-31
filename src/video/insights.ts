import { positions, type MediaInfo, type Mode, type Timeline } from './model';
import { applySteps } from './operations';
import { joinTokens, type FootageIndex } from './understand';

/**
 * What the footage index knows, laid out on the cut: the words as they are heard in the edit, where speakers take
 * turns, where shots change and people laugh. The index is in each video's own (source) seconds; these helpers move it
 * onto the timeline through each clip's trim and speed, so a word clicked here is the word heard there.
 */
export type Indexes = Record<string, FootageIndex>;
export type CutWord = { key: string; text: string; start: number; end: number; speaker: number; filler: boolean; /** Where it lives in its video's index, so a fix can be written back. */ assetId: string; src: number[]; /** The speaker's name, when one was given. */ name?: string };
export type Insight = { kind: 'speaker' | 'shot' | 'laugh'; start: number; end: number; speaker?: number; name?: string; label: string };

const FILLER = /^(um+|uh+|erm+|uhm+|hmm+)[,.!?]?$/i;

/** Clips that play a stretch of a video at a steady speed: where source seconds map straight onto the timeline. */
function spans(t: Timeline, indexes: Indexes) {
  return positions(t).flatMap(({ clip, start }) => {
    const index = indexes[clip.assetId];
    if (!index || clip.freeze !== undefined || clip.speedPoints?.length || clip.reverse) return [];
    return [{ index, clip, at: (s: number) => start + (s - clip.in) / clip.speed, has: (a: number, b: number) => b > clip.in && a < clip.out }];
  });
}

/** Every word heard in the cut, in timeline order, with who says it. */
export function cutWords(t: Timeline, indexes: Indexes): CutWord[] {
  // Older analyses kept split tokens ("5" ".6"); they are joined here too.
  return spans(t, indexes).flatMap(({ index, clip, at }) => joinTokens(index.words.map((w, i) => ({ start: w.t, end: w.e, text: w.w, src: [i] }))).map(w => ({ t: w.start, e: w.end, w: w.text, src: w.src })).filter(w => w.t >= clip.in - .05 && w.e <= clip.out + .05).map((w, i) => ({
    key: `${clip.id}:${i}:${w.t}`, text: w.w, start: at(Math.max(w.t, clip.in)), end: at(Math.min(w.e, clip.out)),
    speaker: index.phrases.find(p => w.t >= p.start - .05 && w.t <= p.end + .05)?.speaker ?? 0, filler: FILLER.test(w.w), assetId: index.assetId, src: w.src,
  })).map(w => ({ ...w, name: index.speakerNames?.[w.speaker] || undefined })));
}

/** Quiet stretches inside the cut, in timeline seconds, keeping a little air on both sides so cuts do not clip words. */
export function pauseRanges(t: Timeline, indexes: Indexes, pad = .15): [number, number][] {
  return spans(t, indexes).flatMap(({ index, at, has, clip }) => index.silences.filter(([a, b]) => has(a, b)).map(([a, b]) => [at(Math.max(a, clip.in)) + pad, at(Math.min(b, clip.out)) - pad] as [number, number])).filter(([a, b]) => b - a >= .3);
}

/** Cuts several timeline ranges at once (latest first, so earlier ranges keep their times). One undo step. */
export function cutRanges(t: Timeline, ranges: [number, number][], assets: MediaInfo[]) {
  const steps = [...ranges].sort((a, b) => b[0] - a[0]).map(([start, end]) => ({ op: 'cutRange' as const, start, end }));
  return applySteps(t, steps, assets).timeline;
}

/** Speaker turns, shot changes and laughs on the timeline, for the strip under the video track. */
export function timelineInsights(t: Timeline, indexes: Indexes): Insight[] {
  const out: Insight[] = [];
  for (const { index, at, has, clip } of spans(t, indexes)) {
    // Neighbouring phrases by the same speaker merge into one turn.
    let turn: Insight | null = null;
    for (const p of index.phrases.filter(p => has(p.start, p.end))) {
      const a = at(Math.max(p.start, clip.in)), b = at(Math.min(p.end, clip.out));
      if (turn && turn.speaker === p.speaker && a - turn.end < 1.2) { turn.end = b; turn.label += ' ' + p.text; }
      else { turn = { kind: 'speaker', start: a, end: b, speaker: p.speaker, name: index.speakerNames?.[p.speaker] || undefined, label: p.text }; out.push(turn); }
    }
    for (const s of index.shots) if (s.start > clip.in && s.start < clip.out) out.push({ kind: 'shot', start: at(s.start), end: at(s.start), label: s.description ?? 'Shot change' });
    for (const e of index.sounds.filter(e => e.label === 'laughter' && has(e.start, e.end))) out.push({ kind: 'laugh', start: at(Math.max(e.start, clip.in)), end: at(Math.min(e.end, clip.out)), label: `Laughter (${Math.round(e.score * 100)}%)` });
  }
  return out;
}

// ---- suggested moments ----
export type Moment = { assetId: string; start: number; end: number; score: number; reasons: string[]; text: string; title?: string };
const LENGTH: Record<Mode, [number, number]> = { trailer: [8, 20], short: [12, 35], long: [25, 75] };
const HYPE = /\b(no way|insane|crazy|what|wow|let'?s go|oh my|bro|million|thousand|\$\d|\d+k|biggest|first|never|secret|best|worst)\b|!/i;

/**
 * The stretches of a video most worth a clip, from the index alone: laughs, quick back-and-forth, a question and its
 * answer, big reactions and numbers, shot changes. Windows start and end on phrase boundaries so nobody is cut off
 * mid-sentence, and the picks never overlap.
 */
export function findMoments(index: FootageIndex, mode: Mode, count = 5): Moment[] {
  const [min, max] = LENGTH[mode], phrases = index.phrases, out: Moment[] = [];
  const laughs = index.sounds.filter(s => s.label === 'laughter');
  const candidates: Moment[] = [];
  if (phrases.length) {
    for (let i = 0; i < phrases.length; i++) {
      let j = i; while (j + 1 < phrases.length && phrases[j + 1].end - phrases[i].start <= max && (phrases[j].end - phrases[i].start < min || phrases[j + 1].start - phrases[j].end < .8)) j++;
      const start = Math.max(0, phrases[i].start - .25), end = Math.min(index.duration, phrases[j].end + .4);
      if (end - start < min * .7) continue;
      const inside = phrases.slice(i, j + 1), text = inside.map(p => p.text).join(' ');
      const turns = inside.filter((p, k) => k > 0 && p.speaker !== inside[k - 1].speaker).length;
      const laughed = laughs.reduce((s, l) => s + Math.max(0, Math.min(end + 1.5, l.end) - Math.max(start, l.start)), 0);
      const asked = inside.some((p, k) => /\?$/.test(p.text) && inside[k + 1] && inside[k + 1].speaker !== p.speaker);
      const hype = (text.match(new RegExp(HYPE.source, 'gi')) ?? []).length;
      const cuts = index.shots.filter(s => s.start > start && s.start < end).length;
      const reasons = [laughed > 0 && 'people laugh', turns >= 2 && 'quick back-and-forth', asked && 'a question and its answer', hype >= 2 && 'big reactions', cuts >= 2 && 'lots of shot changes'].filter(Boolean) as string[];
      candidates.push({ assetId: index.assetId, start, end, text, reasons, score: laughed * 3 + Math.min(turns, 4) + (asked ? 2 : 0) + Math.min(hype, 4) * .8 + Math.min(cuts, 4) * .4 + (/[.!?]$/.test(inside.at(-1)!.text) ? .5 : 0) });
    }
  } else {
    // No speech: shots whose descriptions sound like something happens.
    for (const s of index.shots) {
      const end = Math.min(index.duration, Math.max(s.end, s.start + min)), lively = /laugh|react|smil|celebrat|win|explo|jump|fight|run|dance|surpris/i.test(s.description ?? '');
      candidates.push({ assetId: index.assetId, start: s.start, end: Math.min(end, s.start + max), text: s.description ?? '', reasons: lively ? ['something happens on screen'] : [], score: (lively ? 2 : 0) + s.people.length * .3 });
    }
  }
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    if (out.length >= count) break;
    if (out.some(o => c.start < o.end && c.end > o.start)) continue;
    out.push({ ...c, start: Number(c.start.toFixed(2)), end: Number(c.end.toFixed(2)), score: Number(c.score.toFixed(2)) });
  }
  return out;
}
