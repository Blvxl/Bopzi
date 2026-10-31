'use client';

import { useEffect, useState } from 'react';
import { getAsset, putAsset } from './db';
import type { AssetRecord } from './types';
import { uid } from './util';

export type LoadedAsset = { record: AssetRecord; url: string; img: HTMLImageElement };

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');
const MAX_BYTES = 40 * 1024 * 1024;

const loaded = new Map<string, LoadedAsset>();
const pending = new Map<string, Promise<LoadedAsset | null>>();

function decode(blob: Blob) {
  return new Promise<{ img: HTMLImageElement; url: string }>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function mimeOf(file: File | Blob) {
  if (ACCEPTED_TYPES.includes(file.type)) return file.type;
  const ext = 'name' in file ? file.name.toLowerCase().split('.').pop() : '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/** Samples a small copy of the image to see whether any pixel is see-through. */
function detectAlpha(img: HTMLImageElement, mime: string) {
  if (mime === 'image/jpeg') return false;
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 245) return true;
  return false;
}

/** Stores the uploaded file untouched in IndexedDB and returns its record. */
export async function importImage(file: File | Blob, projectId: string, name?: string) {
  const mime = mimeOf(file);
  if (!mime) throw new Error('Bopzi accepts PNG, JPG and WebP images.');
  if (file.size > MAX_BYTES) throw new Error('That image is over 40 MB. Export a smaller version and try again.');
  const { img, url } = await decode(file);
  const record: AssetRecord = {
    id: uid('a'),
    projectId,
    name: name ?? ('name' in file ? file.name : 'image'),
    mime,
    blob: file,
    width: img.naturalWidth,
    height: img.naturalHeight,
    hasAlpha: detectAlpha(img, mime),
  };
  await putAsset(record);
  loaded.set(record.id, { record, url, img });
  return record;
}

export function getLoadedAsset(id: string) {
  return loaded.get(id) ?? null;
}

export function loadAsset(id: string) {
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const record = await getAsset(id);
      if (!record) return null;
      const { img, url } = await decode(record.blob);
      const entry = { record, url, img };
      loaded.set(id, entry);
      return entry;
    })()
      .catch(() => null)
      .finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

/** Returns the decoded asset, `null` while loading, or `'missing'` if it is not in storage. */
export function useAsset(id: string | undefined) {
  const [state, setState] = useState<{ id: string; value: LoadedAsset | 'missing' } | null>(null);
  const sync = id ? getLoadedAsset(id) : null;
  useEffect(() => {
    if (!id || getLoadedAsset(id)) return;
    let alive = true;
    loadAsset(id).then((a) => alive && setState({ id, value: a ?? 'missing' }));
    return () => {
      alive = false;
    };
  }, [id]);
  if (sync) return sync;
  return state && state.id === id ? state.value : null;
}
