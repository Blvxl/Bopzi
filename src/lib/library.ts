import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Projects on this computer's disk, one JSON file per record, so they don't depend on the app's port.
 * A file is `<group>~<key>.json`, or `<key>.json` with no group. Groups let a project's assets be listed by name alone.
 */
const ROOT = path.join(os.homedir(), '.bopzi', 'library');
const STORES = new Set(['projects', 'assets', 'attachments']);

/** Turns any id into one safe file name part. Nothing in it can leave the folder. */
const part = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.length > 200) throw new Error('That is not a valid project id.');
  return encodeURIComponent(value).replace(/[^\w%-]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
};
const folder = (store: unknown) => {
  if (typeof store !== 'string' || !STORES.has(store)) throw new Error('Unknown store.');
  return path.join(ROOT, store);
};
const names = (dir: string) => readdir(dir).then((all) => all.filter((n) => n.endsWith('.json')), () => [] as string[]);
const read = (file: string) => readFile(file, 'utf8').catch(() => null);

/** The file holding a key, whichever group it's in. */
async function find(store: unknown, key: unknown) {
  const dir = folder(store), name = `${part(key)}.json`;
  const match = (await names(dir)).find((n) => n === name || n.endsWith(`~${name}`));
  return match ? path.join(dir, match) : null;
}

/** Replaces the file in one step, so a crash mid-save leaves the last good copy. */
async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  for (let tries = 0; ; tries++) {
    try { return await rename(temp, file); } catch (error) {
      // Windows refuses while another request is reading the file.
      if (tries === 5) { await rm(temp, { force: true }); throw error; }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

export async function libraryGet(store: unknown, key: unknown) {
  const file = await find(store, key);
  return file ? read(file) : null;
}

/** Every record in a store, or in one group. Returns raw JSON text, so nothing is parsed twice. */
export async function libraryList(store: unknown, group?: unknown) {
  const dir = folder(store);
  const start = group === undefined ? '' : `${part(group)}~`;
  const rows = await Promise.all((await names(dir)).filter((n) => n.startsWith(start)).map((n) => read(path.join(dir, n))));
  return `[${rows.filter(Boolean).join(',')}]`;
}

export async function libraryPut(store: unknown, key: unknown, value: unknown, group?: unknown, onlyIfNew = false) {
  const existing = await find(store, key);
  if (existing && onlyIfNew) return;
  await save(path.join(folder(store), `${group === undefined ? '' : `${part(group)}~`}${part(key)}.json`), value);
}

export async function libraryDelete(store: unknown, key: unknown) {
  const file = await find(store, key);
  if (file) await rm(file, { force: true });
}
