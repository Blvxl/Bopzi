export type ComposerTarget = { id: string; kind: string; label: string; start: number; duration: number };
const clock = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(2).padStart(5, '0')}`;
export const targetTime = (target: ComposerTarget) => `${clock(target.start)}–${clock(target.start + target.duration)}`;
export function composerSuggestions(target?: ComposerTarget, effect?: string) {
  if (effect === 'counter' && target) return [
    { label: 'Count slower', prompt: 'Make this selected counter count more slowly. Keep its final value, position and styling.' },
    { label: 'Smooth the count', prompt: 'Make this selected counter count smoothly with smoother easing, no entrance bounce and no final bounce. Preserve its values and position.' },
  ];
  if (target?.kind === 'clips') return [
    { label: 'Smooth zoom', prompt: `Add a subtle smooth zoom that eases in and stays during the selected clip (${targetTime(target)}). Keep the rest of the edit unchanged.` },
    { label: 'Tighten this cut', prompt: 'Trim a little from the beginning and end of this selected clip for tighter pacing. Preserve the other clips and effects.' },
  ];
  if (target) return [
    { label: 'Make it stand out', prompt: 'Make this selected element more readable and visually prominent. Preserve its meaning and timing.' },
    { label: 'Gentler animation', prompt: 'Make the animation on this selected element gentler. Keep its position, content and timing.' },
  ];
  return [
    { label: 'Tighten pacing', prompt: 'Tighten the pacing of this edit while preserving its story and existing visual style.' },
    { label: 'Create a stronger hook', prompt: 'Create a stronger opening hook from my existing footage. Keep it punchy, make the first second grab attention, and preserve the rest of the edit where possible.' },
    { label: 'Make a vertical cut', prompt: 'Make a vertical version of this edit. Adapt the placement of titles and counters for the vertical frame.' },
  ];
}
