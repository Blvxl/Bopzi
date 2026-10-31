/** Whisper sometimes splits "5.6" or "it's" into pieces (".6", "'s"): glue such a piece onto the word before it. */
export function joinTokens<T extends { start: number; end: number; text: string }>(words: T[]): T[] {
  const out: T[] = [];
  // A joined word remembers which pieces it came from (src), so a fix to it can be written back to each of them.
  for (const w of words) { const last = out.at(-1) as (T & { src?: number[] }) | undefined, piece = w as T & { src?: number[] }; if (last && /^([.,%!?']|'s\b|\.\d)/i.test(w.text) && w.start - last.end < .3) out[out.length - 1] = { ...last, text: last.text + w.text, end: w.end, ...(last.src && piece.src ? { src: [...last.src, ...piece.src] } : {}) }; else out.push(w); }
  return out;
}

