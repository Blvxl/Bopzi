/**
 * Colour correction for a clip, CapCut's "Adjust": brightness, contrast, saturation and hue, plus one-click looks.
 * The numbers mean exactly what the browser's CSS filters mean (1 is unchanged), so the preview draws them with
 * ctx.filter, and the export applies the very same arithmetic in FFmpeg: brightness and contrast as a lookup per
 * channel, saturation and hue together as the colour matrix the CSS spec defines for them. Pure.
 */
export type Grade = { brightness: number; contrast: number; saturate: number; hue: number };
export const NEUTRAL: Grade = { brightness: 1, contrast: 1, saturate: 1, hue: 0 };
export const GRADE_LIMITS = { brightness: [.3, 2], contrast: [.3, 2.5], saturate: [0, 3], hue: [-180, 180] } as const;
export const GRADE_PRESETS: { id: string; label: string; grade: Grade }[] = [
  { id: 'vivid', label: 'Vivid', grade: { brightness: 1.03, contrast: 1.1, saturate: 1.45, hue: 0 } },
  { id: 'punchy', label: 'Punchy', grade: { brightness: 1, contrast: 1.28, saturate: 1.3, hue: 0 } },
  { id: 'bright', label: 'Bright', grade: { brightness: 1.15, contrast: 1.05, saturate: 1.1, hue: 0 } },
  { id: 'moody', label: 'Moody', grade: { brightness: .88, contrast: 1.22, saturate: .75, hue: 0 } },
  { id: 'dreamy', label: 'Dreamy', grade: { brightness: 1.08, contrast: .88, saturate: 1.2, hue: -8 } },
  { id: 'mono', label: 'Black & white', grade: { brightness: 1, contrast: 1.15, saturate: 0, hue: 0 } },
];
export const isNeutral = (g?: Grade) => !g || (g.brightness === 1 && g.contrast === 1 && g.saturate === 1 && g.hue === 0);

/** For the canvas: the same filter chain the export reproduces. */
export function gradeFilter(g?: Grade) {
  if (isNeutral(g)) return 'none';
  return `brightness(${g!.brightness}) contrast(${g!.contrast}) saturate(${g!.saturate}) hue-rotate(${g!.hue}deg)`;
}

/** The CSS spec's saturate and hue-rotate matrices, applied in that order, as one 3×3 matrix (rows: out R, G, B). */
export function colourMatrix(g: Grade) {
  const s = g.saturate, S = [
    [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s],
    [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s],
    [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s]];
  const a = g.hue * Math.PI / 180, c = Math.cos(a), n = Math.sin(a), H = [
    [.213 + c * .787 - n * .213, .715 - c * .715 - n * .715, .072 - c * .072 + n * .928],
    [.213 - c * .213 + n * .143, .715 + c * .285 + n * .140, .072 - c * .072 - n * .283],
    [.213 - c * .213 - n * .787, .715 - c * .715 + n * .715, .072 + c * .928 + n * .072]];
  return H.map(row => [0, 1, 2].map(j => row.reduce((sum, h, k) => sum + h * S[k][j], 0)));
}

/** FFmpeg filters for a grade, to append to a clip's video filter chain; none for an unchanged clip. */
export function gradeFilters(g?: Grade): string[] {
  if (isNeutral(g)) return [];
  const out: string[] = [], { brightness: b, contrast: k } = g!;
  if (b !== 1 || k !== 1) { const f = `clip((clip(val*${b},0,255)-127.5)*${k}+127.5,0,255)`; out.push(`lutrgb=r='${f}':g='${f}':b='${f}'`); }
  if (g!.saturate !== 1 || g!.hue !== 0) {
    const m = colourMatrix(g!), f = (v: number) => v.toFixed(5);
    out.push(`colorchannelmixer=rr=${f(m[0][0])}:rg=${f(m[0][1])}:rb=${f(m[0][2])}:gr=${f(m[1][0])}:gg=${f(m[1][1])}:gb=${f(m[1][2])}:br=${f(m[2][0])}:bg=${f(m[2][1])}:bb=${f(m[2][2])}`);
  }
  return out;
}

/** A grade from untrusted input (a saved project or the AI): numbers in range, or an error. */
export function validateGrade(value: unknown): Grade | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid colour adjustment.');
  const raw = value as Record<string, unknown>, out = { ...NEUTRAL };
  for (const key of Object.keys(GRADE_LIMITS) as (keyof Grade)[]) {
    const v = raw[key] ?? NEUTRAL[key], [min, max] = GRADE_LIMITS[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid colour ${key}.`);
    out[key] = v;
  }
  return isNeutral(out) ? undefined : out;
}
