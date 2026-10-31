import type { Media } from './model';
import { describeIndex, knownIndex } from './understand';

/**
 * Every finished footage index, as text for an edit request. Videos are named V1, V2… exactly as on the contact
 * sheets, so "V1 at 14.5s" means the same thing everywhere the AI looks. Videos still being analysed are left out.
 */
export async function footageText(assets: Media[], legend: { ref: string; id: string }[], budget = 24000) {
  const videos = assets.filter(a => a.kind === 'video');
  const parts: string[] = [];
  for (const asset of videos) {
    const index = await knownIndex(asset); if (!index) continue;
    const ref = legend.find(l => l.id === asset.id)?.ref ?? asset.name;
    parts.push(describeIndex(index, ref, Math.floor(budget / Math.max(1, videos.length))));
  }
  return parts.join('\n\n');
}
