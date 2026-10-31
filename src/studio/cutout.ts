import type { CutoutReply, CutoutRequest } from './cutout.worker';

let worker: Worker | null = null;
let seq = 0;

/**
 * Returns the picture as a PNG with everything but its subject made see-through.
 * `onProgress` reports the one-time model download, 0 to 100.
 */
export function removeBackground(blob: Blob, onProgress?: (percent: number) => void) {
  worker ??= new Worker(new URL('./cutout.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = ++seq;
  return new Promise<Blob>((resolve, reject) => {
    const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
    const onMessage = (e: MessageEvent<CutoutReply>) => {
      if (e.data.id !== id) return;
      if ('progress' in e.data) { onProgress?.(e.data.progress); return; }
      done();
      if ('error' in e.data) reject(new Error(e.data.error));
      else resolve(e.data.blob);
    };
    const onError = () => { done(); worker = null; w.terminate(); reject(new Error('The background remover could not start in this browser.')); };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, blob } satisfies CutoutRequest);
  });
}
