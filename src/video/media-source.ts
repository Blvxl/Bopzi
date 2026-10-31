import type { DiskMedia, Media, MediaKind } from './model';
import { setOwnSounds, type OwnSound } from './sounds';

/**
 * Where a piece of media's picture and sound come from. Browser media decodes its own blob; media on disk asks the
 * local server, which reads only the range needed, so an hours-long recording never has to fit in the browser.
 */

const LOCAL = { 'x-bopzi-local': '1' };
const api = (id: string) => `/api/video/library/${encodeURIComponent(id)}`;
/** The preview URL. `v` changes once the preview copy is ready, so players reload it instead of the original. */
export const diskUrl = (disk: DiskMedia) => `${api(disk.id)}/file${disk.preview?.ready ? '?v=preview' : ''}`;

/** Mono samples at `rate`; `from`/`to` in source seconds limit it to a range. Null for footage without sound. */
export async function audioSamples(asset: Media, rate: number, from = 0, to?: number): Promise<Float32Array | null> {
  if (asset.disk) {
    const q = new URLSearchParams({ rate: String(rate), from: String(from), ...(to !== undefined ? { length: String(Math.max(.01, to - from)) } : {}) });
    const response = await fetch(`${api(asset.disk.id)}/samples?${q}`);
    if (response.status === 204) return null;
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || `The sound of ${asset.name} could not be read.`);
    return new Float32Array(await response.arrayBuffer());
  }
  if (!asset.blob) return null;
  // Decoding through a context at `rate` resamples on the way in.
  const buffer = await new OfflineAudioContext(1, rate, rate).decodeAudioData(await asset.blob.arrayBuffer());
  const first = Math.floor(from * rate), last = to === undefined ? buffer.length : Math.min(buffer.length, Math.ceil(to * rate));
  const mono = new Float32Array(Math.max(0, last - first));
  for (let c = 0; c < buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < mono.length; i++) mono[i] += data[first + i] / buffer.numberOfChannels; }
  return mono;
}

/** Loudness measured by the server for media on disk; undefined means "measure it here". */
export async function diskLoudness(asset: Media): Promise<number[] | null | undefined> {
  if (!asset.disk) return undefined;
  const response = await fetch(`${api(asset.disk.id)}/loudness`);
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Loudness could not be measured.');
  return (await response.json()).db;
}

/** A URL a video element can read for this asset, and how to let go of it. */
export function readableUrl(asset: Media) {
  if (asset.disk || !asset.blob) return { url: asset.url, release: () => {} };
  const url = URL.createObjectURL(asset.blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}

type Added = { id: string; path: string; name: string; kind: MediaKind; duration: number; width: number; height: number; poster?: string };
const toMedia = (a: Added): Media => {
  const disk: DiskMedia = { id: a.id, path: a.path, preview: a.kind === 'video' ? { ready: false, percent: 0 } : undefined };
  return { id: crypto.randomUUID(), name: a.name, kind: a.kind, duration: a.duration, width: a.width, height: a.height, poster: a.poster ?? '', url: diskUrl(disk), disk };
};
async function answer<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error || fallback), { unsupported: !!body?.unsupported });
  return body as T;
}

/** Full file paths in pasted text, one per line, with or without the quotes Explorer's "Copy as path" adds. */
export function mediaPaths(text: string) {
  return text.split(/\r?\n/).map(l => l.trim().replace(/^"(.*)"$/, '$1')).filter(l => /^([a-z]:\\|\\\\|\/).+\.(mp4|mov|mkv|webm|avi|m4v|flv|ts|mp3|wav|m4a|aac|ogg|opus|flac|png|jpe?g|webp|gif|bmp)$/i.test(l));
}

/** Opens the system file picker on this computer. Empty when cancelled. */
export async function pickPaths() {
  return (await answer<{ paths: string[] }>(await fetch('/api/video/library/pick', { method: 'POST', headers: LOCAL }), 'The file picker could not open.')).paths;
}

/** Adds files by path. Files that fail come back as messages; the rest are added. */
export async function addPaths(paths: string[]) {
  const body = await answer<{ added: Added[]; errors: string[] }>(await fetch('/api/video/library', { method: 'POST', headers: { ...LOCAL, 'content-type': 'application/json' }, body: JSON.stringify({ paths }) }), 'The files could not be added.');
  return { added: body.added.map(toMedia), errors: body.errors };
}

/** A dropped file, streamed to the library: the browser never holds it, whatever its size. */
export async function addDropped(file: File) {
  const response = await fetch(`/api/video/library/upload?name=${encodeURIComponent(file.name)}`, { method: 'PUT', headers: LOCAL, body: file });
  return toMedia((await answer<{ added: Added }>(response, `“${file.name}” could not be added.`)).added);
}

export async function previewStatus(disk: DiskMedia): Promise<NonNullable<DiskMedia['preview']>> {
  const response = await fetch(api(disk.id), { cache: 'no-store' });
  return answer(response, 'Preview status is unavailable.');
}
let pack: Promise<string | null> | null = null;
/** Reads the creator's own sound pack once per page and registers it. Answers with where the pack lives. */
export function loadOwnSounds() {
  return pack ??= fetch('/api/video/sounds', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then((body: { root: string; sounds: OwnSound[] }) => { setOwnSounds(body.sounds); return body.root; }).catch(() => { pack = null; return null; });
}

export const retryPreview =(disk: DiskMedia) => fetch(api(disk.id), { method: 'POST', headers: LOCAL });
export const revealExport = (file: string) => fetch('/api/video/library/reveal', { method: 'POST', headers: { ...LOCAL, 'content-type': 'application/json' }, body: JSON.stringify({ file }) });
