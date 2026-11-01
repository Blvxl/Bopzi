import type { AssetRecord, Project } from './types';
import { uid } from './util';

// Everything Bopzi saves lives on this computer's disk, through /api/library.
type Store = 'projects' | 'assets' | 'attachments';
type Call = { op: 'get' | 'list' | 'put' | 'delete'; store: Store; key?: string; group?: string; value?: unknown; onlyIfNew?: boolean };

async function call<T>(body: Call) {
  const res = await fetch('/api/library', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify(body) });
  const reply = await res.json().catch(() => null) as T & { error?: string } | null;
  if (!res.ok) throw new Error(reply?.error ?? 'Could not reach your projects. Try again.');
  return reply as T;
}

// Files hold text, so images travel inside a record as data URLs.
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
async function pack(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $blob: await dataUrl(value) };
  if (Array.isArray(value)) return Promise.all(value.map(pack));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await pack(v)])));
  return value;
}
function unpack(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpack);
  if (!value || typeof value !== 'object') return value;
  const blob = (value as { $blob?: unknown }).$blob;
  if (typeof blob === 'string') {
    const [head, data] = blob.split(',');
    return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: /^data:([^;]*)/.exec(head)?.[1] ?? '' });
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v)]));
}

const get = async <T>(store: Store, key: string) => (unpack(await call({ op: 'get', store, key })) ?? undefined) as T | undefined;
const list = async <T>(store: Store, group?: string) => unpack(await call({ op: 'list', store, group })) as T[];
/** One save at a time, in order, so an older autosave can never land on top of a newer one. */
let saving: Promise<unknown> = Promise.resolve();
const inOrder = <T>(job: () => Promise<T>) => {
  const next = saving.catch(() => undefined).then(job);
  saving = next;
  return next;
};
const put = async (store: Store, key: string, value: unknown, group?: string, onlyIfNew?: boolean) => {
  const packed = await pack(value);
  await inOrder(() => call({ op: 'put', store, key, value: packed, group, onlyIfNew }));
};
const remove = (store: Store, key: string) => inOrder(() => call({ op: 'delete', store, key }));

/** Set when someone signs in. Projects live in one database, so each is marked with its owner. */
let owner = '';
export const setOwner = (id: string) => { owner = id; };
const mine = (p: Project | undefined) => (p && p.owner === owner ? p : undefined);

/**
 * Projects saved before this owner system have no real owner, so they go to whoever signs in on this device.
 * The app's owner also takes back projects tagged by earlier sign-in versions on this computer.
 */
export async function claimProjects(admin = false) {
  await importBrowserProjects();
  const all = await list<Project>('projects');
  const earlier = (tag = '') => admin && tag !== owner && /^[a-f0-9]{24}$/.test(tag);
  for (const project of all) if (!project.owner || project.owner === 'local' || earlier(project.owner)) await putProject({ ...project, owner });
}

export async function putProject(project: Project) {
  await put('projects', project.id, { ...project, owner: project.owner ?? owner });
}

export async function getProject(id: string) {
  return mine(await get<Project>('projects', id));
}

export async function listProjects() {
  const all = await list<Project>('projects');
  return all.filter((p) => p.owner === owner).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putAsset(asset: AssetRecord) {
  await put('assets', asset.id, asset, asset.projectId);
}

export async function getAsset(id: string) {
  return get<AssetRecord>('assets', id);
}

export async function listProjectAssets(projectId: string) {
  return list<AssetRecord>('assets', projectId);
}

export async function deleteAsset(id: string) {
  await remove('assets', id);
}

/** The avatar, images and inspiration attached in the composer, as the composer keeps them. */
export type Attachments<T = unknown> = { projectId: string; references: T[]; style: T | null };

export async function getAttachments<T>(projectId: string) {
  return get<Attachments<T>>('attachments', projectId);
}

export async function putAttachments<T>(value: Attachments<T>) {
  await put('attachments', value.projectId, value);
}

// The project's game icon sits in the same store under its own key.
const iconKey = (projectId: string) => `${projectId}:icon`;

export async function getIcon(projectId: string) {
  const row = await get<{ blob?: Blob }>('attachments', iconKey(projectId));
  return row?.blob;
}

export async function putIcon(projectId: string, blob: Blob) {
  await put('attachments', iconKey(projectId), { projectId: iconKey(projectId), blob });
}

export async function deleteIcon(projectId: string) {
  await remove('attachments', iconKey(projectId));
}

export async function deleteProject(id: string) {
  const assets = await listProjectAssets(id);
  for (const a of assets) await deleteAsset(a.id);
  await remove('attachments', id);
  await deleteIcon(id);
  await remove('projects', id);
}

/** Copies a project and its image files so the two can be edited independently. */
export async function duplicateProject(id: string) {
  const src = await getProject(id);
  if (!src) return null;
  const newId = uid('p');
  const map = new Map<string, string>();
  for (const a of await listProjectAssets(id)) {
    const assetId = uid('a');
    map.set(a.id, assetId);
    await putAsset({ ...a, id: assetId, projectId: newId });
  }
  const now = Date.now();
  const copy: Project = {
    ...src,
    id: newId,
    name: `${src.name} copy`,
    createdAt: now,
    updatedAt: now,
    doc: {
      ...src.doc,
      layers: src.doc.layers.map((l) =>
        l.type === 'image' ? { ...l, assetId: map.get(l.assetId) ?? l.assetId } : l,
      ),
    },
  };
  const attached = await getAttachments(id);
  if (attached) await putAttachments({ ...attached, projectId: newId });
  await putProject(copy);
  return copy;
}

/** Copies anything still in the browser's old storage onto disk, once. The old copy stays where it is. */
async function importBrowserProjects() {
  const DONE = 'bopzi-projects-on-disk';
  try { if (localStorage.getItem(DONE)) return; } catch { /* no local storage: the copy just runs again, and skips what's there */ }
  if (!(await indexedDB.databases()).some((d) => d.name === 'bopzi')) return;
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('bopzi');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const all = (name: string) => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    if (!old.objectStoreNames.contains(name)) return resolve([]);
    const req = old.transaction(name).objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  for (const row of await all('projects')) await put('projects', String(row.id), row, undefined, true);
  for (const row of await all('assets')) await put('assets', String(row.id), row, String(row.projectId), true);
  for (const row of await all('attachments')) await put('attachments', String(row.projectId), row, undefined, true);
  old.close();
  try { localStorage.setItem(DONE, '1'); } catch { /* see above */ }
}

/** Blank projects saved by older versions never had anything in them, so lists leave them out. */
export const hasContent = (p: Project) => p.doc.layers.length > 0 || !/^Untitled (thumbnail|icon)$/.test(p.name);
