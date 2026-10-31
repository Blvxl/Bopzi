import type { AssetRecord, Project } from './types';
import { uid } from './util';

// Everything Bopzi saves lives in this one IndexedDB database, in the user's browser.
const DB_NAME = 'bopzi';
const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const has = (name: string) => db.objectStoreNames.contains(name);
        if (!has('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!has('assets')) db.createObjectStore('assets', { keyPath: 'id' }).createIndex('projectId', 'projectId');
        // v2: the images attached to a project's composer, kept apart so autosave never rewrites them.
        if (!has('attachments')) db.createObjectStore('attachments', { keyPath: 'projectId' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // When a newer Bopzi tab needs to upgrade the database, let go of it so that tab is not left waiting.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      // An older Bopzi tab is holding the database open. Say so; do not wait in silence.
      req.onblocked = () => reject(new Error('Another Bopzi tab is blocking storage. Close your other Bopzi tabs, then try again.'));
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

const wrap = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function store(name: 'projects' | 'assets' | 'attachments', mode: IDBTransactionMode = 'readonly') {
  return (await openDb()).transaction(name, mode).objectStore(name);
}

export async function putProject(project: Project) {
  await wrap((await store('projects', 'readwrite')).put(project));
}

export async function getProject(id: string) {
  return wrap<Project | undefined>((await store('projects')).get(id));
}

export async function listProjects() {
  const all = await wrap<Project[]>((await store('projects')).getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putAsset(asset: AssetRecord) {
  await wrap((await store('assets', 'readwrite')).put(asset));
}

export async function getAsset(id: string) {
  return wrap<AssetRecord | undefined>((await store('assets')).get(id));
}

export async function listProjectAssets(projectId: string) {
  return wrap<AssetRecord[]>((await store('assets')).index('projectId').getAll(projectId));
}

export async function deleteAsset(id: string) {
  await wrap((await store('assets', 'readwrite')).delete(id));
}

/** The avatar, images and inspiration attached in the composer, as the composer keeps them. */
export type Attachments<T = unknown> = { projectId: string; references: T[]; style: T | null };

export async function getAttachments<T>(projectId: string) {
  return wrap<Attachments<T> | undefined>((await store('attachments')).get(projectId));
}

export async function putAttachments<T>(value: Attachments<T>) {
  await wrap((await store('attachments', 'readwrite')).put(value));
}

// The project's game icon sits in the same store under its own key.
const iconKey = (projectId: string) => `${projectId}:icon`;

export async function getIcon(projectId: string) {
  const row = await wrap<{ blob?: Blob } | undefined>((await store('attachments')).get(iconKey(projectId)));
  return row?.blob;
}

export async function putIcon(projectId: string, blob: Blob) {
  await wrap((await store('attachments', 'readwrite')).put({ projectId: iconKey(projectId), blob }));
}

export async function deleteIcon(projectId: string) {
  await wrap((await store('attachments', 'readwrite')).delete(iconKey(projectId)));
}

export async function deleteProject(id: string) {
  const assets = await listProjectAssets(id);
  for (const a of assets) await deleteAsset(a.id);
  await wrap((await store('attachments', 'readwrite')).delete(id));
  await deleteIcon(id);
  await wrap((await store('projects', 'readwrite')).delete(id));
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

/** Blank projects saved by older versions never had anything in them, so lists leave them out. */
export const hasContent = (p: Project) => p.doc.layers.length > 0 || !/^Untitled (thumbnail|icon)$/.test(p.name);
