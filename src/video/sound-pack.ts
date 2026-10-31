import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { processMedia, soundPackRoot } from './render';
import { setOwnSounds, type OwnSound } from './sounds';

/**
 * The creator's own sound pack, read from ~/.bopzi/sounds: sfx/ holds sound effects, music/ holds tracks. Files are
 * picked up as they are dropped in; a name containing "(MAIN …)" marks a default, and the marker is left out of the
 * label. Durations are measured once and kept in pack.json.
 */

const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac']);
type Measured = Record<string, { size: number; mtime: number; duration: number }>;

/** "vine-boom" → "Vine boom"; "Elevator Music (MAIN SOUND)" → "Elevator Music". */
export function labelOf(file: string) {
  const base = path.basename(file, path.extname(file)).replace(/\s*\(main[^)]*\)\s*/i, ' ').replace(/_/g, "'").trim();
  return /[A-Z ]/.test(base) && !/^[a-z0-9-]+$/.test(base) ? base : (base.charAt(0).toUpperCase() + base.slice(1)).replace(/-/g, ' ');
}
const slug = (file: string) => path.basename(file, path.extname(file)).toLowerCase().replace(/\(main[^)]*\)/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

let reading: Promise<OwnSound[]> | null = null, readAt = 0;
/** The pack as it is on disk now (re-read at most every few seconds), and registered for timeline checks. */
export function loadSoundPack(): Promise<OwnSound[]> {
  if (reading && Date.now() - readAt < 5000) return reading;
  readAt = Date.now();
  reading = read().then(list => { setOwnSounds(list); return list; }, () => { setOwnSounds([]); return []; });
  return reading;
}

async function read() {
  const root = soundPackRoot(), cacheFile = path.join(root, 'pack.json');
  const cache: Measured = await readFile(cacheFile, 'utf8').then(JSON.parse, () => ({}));
  const list: OwnSound[] = [], seen = new Set<string>(); let changed = false;
  for (const kind of ['sfx', 'music'] as const) {
    const names = await readdir(path.join(root, kind)).catch(() => [] as string[]);
    for (const name of names.filter(n => AUDIO.has(path.extname(n).toLowerCase())).sort((a, b) => a.localeCompare(b))) {
      const file = `${kind}/${name}`, full = path.join(root, kind, name), info = await stat(full);
      let known = cache[file];
      if (!known || known.size !== info.size || known.mtime !== info.mtimeMs) {
        const probed = await processMedia(process.env.BOPZI_FFPROBE || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], undefined, undefined, 30000).catch(() => '');
        known = cache[file] = { size: info.size, mtime: info.mtimeMs, duration: Number(probed.trim()) || 0 }; changed = true;
      }
      if (!(known.duration > 0)) continue;
      let id = `${kind === 'sfx' ? 'my' : 'music'}-${slug(name) || 'sound'}`; while (seen.has(id)) id += '-2'; seen.add(id);
      list.push({ id, label: labelOf(name), kind, file, path: full, duration: Number(known.duration.toFixed(2)), ...(/\(main[^)]*\)/i.test(name) ? { main: true } : {}) });
    }
  }
  if (changed) await writeFile(cacheFile, JSON.stringify(cache, null, 1)).catch(() => {});
  return list;
}

/** The full path of a pack file named as the list names it ("sfx/vine-boom.mp3"), or null. */
export async function packFile(file: string) {
  const found = (await loadSoundPack()).find(s => s.file === file);
  return found ? found.path : null;
}
