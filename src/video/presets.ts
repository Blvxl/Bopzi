import { EFFECT_LABELS, type Effect } from './motion';

/**
 * Effects saved by the user to reuse in any project, like CapCut's "My presets". They hold an effect's settings but not
 * where it sits: adding one places it at the playhead. Kept in this browser; a blocked storage just means no presets.
 */
export type EffectPreset = { id: string; name: string; effect: Effect };
const KEY = 'bopzi-effect-presets';

export function loadPresets(): EffectPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.effect && typeof p.effect.kind === 'string') : [];
  } catch { return []; }
}
export function storePresets(presets: EffectPreset[]) {
  try { localStorage.setItem(KEY, JSON.stringify(presets)); } catch { /* storage blocked: kept for this session only */ }
}

/** A short name that says what the preset does, e.g. "Zoom 1.6× · stay" or "Shake · strong". */
export function presetName(e: Effect) {
  const label = EFFECT_LABELS[e.kind];
  if (e.kind === 'zoom') return `${label} ${e.amount.toFixed(2).replace(/0$/, '')}× · ${e.mode === 'hold' ? 'stay' : 'punch'}`;
  if (e.kind === 'shake') return `${label} · ${e.strength < .02 ? 'subtle' : e.strength < .04 ? 'strong' : 'extreme'}`;
  if (e.kind === 'counter') return `${label} ${e.prefix}${e.to.toLocaleString('en-US')}${e.suffix}`.trim();
  if (e.kind === 'highlight') return `${label} · ${e.style === 'tint' ? 'colour' : e.style}`;
  if (e.kind === 'blur') return `${e.style === 'pixelate' ? 'Pixelate' : label} · ${e.strength < .4 ? 'light' : e.strength < .75 ? 'medium' : 'strong'}`;
  return `${label} · ${e.color}`;
}

/** The settings worth keeping: no place on a timeline and no traced outline, which only fits the shot it came from. */
export function presetFrom(e: Effect): Effect {
  const copy = { ...e, start: 0 } as Effect;
  if (copy.kind === 'highlight') delete copy.mask;
  return copy;
}
