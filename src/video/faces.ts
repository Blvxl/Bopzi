import { fontOf } from '@/lib/fonts';
import type { Face } from './model';

/** A studio font as the canvas draws it, for titles and captions. */
export const face = (key: string): Face => { const f = fontOf(key); return { family: f.family, weight: f.weight }; };
