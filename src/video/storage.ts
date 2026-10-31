import type { Media, SavedProject } from './model';
import { diskUrl } from './media-source';
type StoredMedia = Omit<Media, 'url' | 'proxyUrl'> & { projectId: string };
let opening: Promise<IDBDatabase> | undefined;
function db() { return opening ??= new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open('bopzi-video', 1); req.onupgradeneeded = () => { req.result.createObjectStore('projects', { keyPath: 'id' }); req.result.createObjectStore('media', { keyPath: 'id' }).createIndex('project', 'projectId'); }; req.onsuccess = () => resolve(req.result); req.onerror = () => { opening = undefined; reject(req.error); }; }); }
async function transaction<T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const tx = (await db()).transaction(store, mode); const req = action(tx.objectStore(store)); return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Storage operation was cancelled.')); }); }
export const listVideoProjects = () => transaction<SavedProject[]>('projects', 'readonly', s => s.getAll());
export const getVideoProject = (id: string) => transaction<SavedProject | undefined>('projects', 'readonly', s => s.get(id));
export const saveVideoProject = (project: SavedProject) => transaction('projects', 'readwrite', s => s.put(project));
export async function deleteVideoProject(id: string) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['projects', 'media'], 'readwrite');
    tx.objectStore('projects').delete(id);
    const cursor = tx.objectStore('media').index('project').openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => { const key = cursor.result; if (key) { tx.objectStore('media').delete(key.primaryKey); key.continue(); } };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Delete was cancelled.'));
  });
}
export async function duplicateVideoProject(id: string) {
  const source = await getVideoProject(id); if (!source) return null;
  const media = await getMedia(id), newId = crypto.randomUUID(), ids = new Map(media.map(a => [a.id, crypto.randomUUID()]));
  const copyTimeline = (timeline: SavedProject['timeline'], rename = false) => ({
    ...timeline,
    name: rename ? `${timeline.name} copy` : timeline.name,
    clips: timeline.clips.map(c => ({ ...c, assetId: ids.get(c.assetId) ?? c.assetId })),
    audio: timeline.audio.map(a => ({ ...a, assetId: ids.get(a.assetId) ?? a.assetId })),
    overlays: timeline.overlays.map(o => ({ ...o, assetId: o.assetId ? ids.get(o.assetId) ?? o.assetId : undefined })),
    // Projects saved before video overlays have none.
    videoOverlays: (timeline.videoOverlays ?? []).map(o => ({ ...o, assetId: ids.get(o.assetId) ?? o.assetId })),
    removedMediaIds: timeline.removedMediaIds?.map(assetId => ids.get(assetId) ?? assetId),
  });
  // Media on disk is shared: both projects point at the same library entry.
  for (const asset of media) await saveMedia(newId, { ...asset, id: ids.get(asset.id)!, url: '' });
  const now = Date.now();
  const copy: SavedProject = { ...source, id: newId, timeline: copyTimeline(source.timeline, true), updatedAt: now,
    revisions: source.revisions?.map(r => ({ ...r, timeline: copyTimeline(r.timeline) })),
    cuts: source.cuts?.map(c => ({ ...c, id: crypto.randomUUID(), timeline: copyTimeline(c.timeline) })) };
  await saveVideoProject(copy); return copy;
}
export const saveMedia = (projectId: string, media: Media) => { const { url: _url, proxyUrl: _proxyUrl, ...data } = media; return transaction('media', 'readwrite', s => s.put({ ...data, projectId })); };
export const getMedia = (projectId: string) => transaction<StoredMedia[]>('media', 'readonly', s => s.index('project').getAll(projectId));
/** A saved record, playable again: blob URLs for browser media, the library's URL for media on disk. */
export function restoreMedia({ projectId: _projectId, ...a }: StoredMedia): Media {
  if (a.disk) return { ...a, url: diskUrl(a.disk) };
  return { ...a, url: a.blob ? URL.createObjectURL(a.blob) : '', ...(a.proxyBlob ? { proxyUrl: URL.createObjectURL(a.proxyBlob) } : {}) };
}
/** Lets go of the blob URLs a piece of media holds. Library URLs need nothing. */
export function releaseMedia(a: Media) { if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url); if (a.proxyUrl?.startsWith('blob:')) URL.revokeObjectURL(a.proxyUrl); }
export async function importMedia(file: File): Promise<Media> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind) throw new Error(`“${file.name}” is not a supported video, image or audio file.`);
  if (file.size > 150 * 1024 * 1024) throw new Error('Each file must be smaller than 150 MB.');
  const url = URL.createObjectURL(file); let width = 0, height = 0, duration = 4, poster = '';
  try {
    if (kind === 'image') { const image = new Image(); image.src = url; await image.decode(); width = image.width; height = image.height; const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * height / width)); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); poster = canvas.toDataURL('image/jpeg', .65); }
    else {
      const el = document.createElement(kind === 'video' ? 'video' : 'audio'); el.preload = 'auto'; el.muted = true;
      await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('This media took too long to open. Try MP4, WebM, MP3 or WAV.')), 15000); const done = () => { clearTimeout(timer); resolve(); }; el.onloadeddata = done; el.onerror = () => { clearTimeout(timer); reject(new Error(`This browser cannot read “${file.name}”. Try MP4 or MP3.`)); }; el.src = url; });
      duration = el.duration; if (!Number.isFinite(duration) || duration <= 0) throw new Error('The file has no readable duration.');
      if (el instanceof HTMLVideoElement) { width = el.videoWidth; height = el.videoHeight; const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * height / width)); canvas.getContext('2d')!.drawImage(el, 0, 0, canvas.width, canvas.height); poster = canvas.toDataURL('image/jpeg', .65); }
      el.removeAttribute('src'); el.load();
    }
    return { id: crypto.randomUUID(), name: file.name, kind, duration, width, height, poster, blob: file, url };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
