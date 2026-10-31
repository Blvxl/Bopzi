import { pipeline, RawImage } from '@huggingface/transformers';

/**
 * Background removal, off the main thread. The model is fetched from Hugging Face the first time and kept
 * by the browser afterwards; the picture itself never leaves this computer.
 * MODNet (Apache-2.0, 26 MB) is the one that runs well here: BiRefNet-lite ran out of memory in the browser and
 * ormbg took several times as long.
 */
const MODEL = 'Xenova/modnet';

export type CutoutRequest = { id: number; blob: Blob };
export type CutoutReply = { id: number; blob: Blob } | { id: number; error: string } | { id: number; progress: number };

type Remover = (image: RawImage) => Promise<RawImage>;
let remover: Promise<Remover> | null = null;

function load(id: number) {
  remover ??= (pipeline('background-removal', MODEL, {
    // Only the weights are big enough to be worth reporting.
    progress_callback: (p: { status?: string; file?: string; progress?: number }) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx') && typeof p.progress === 'number') postMessage({ id, progress: p.progress } satisfies CutoutReply);
    },
  }) as unknown as Promise<Remover>).catch((e) => {
    // A failed download must not stick: the next try starts again.
    remover = null;
    throw e;
  });
  return remover;
}

const SOLID = 128;
/** Pieces smaller than this share of the biggest one are leftovers, not a second subject. */
const KEEP = 0.25;
/** How far from a kept piece its soft edge may reach, in pixels. */
const EDGE = 3;

/**
 * The model leaves stray patches and a faint haze where the background was busy. The subject is the large solid
 * piece (or pieces), so everything that is not on or right beside one is cleared. Works on RGBA data in place.
 */
function tidy(data: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const label = new Int32Array(n);
  const sizes = [0];
  const queue = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (label[start] || data[start * 4 + 3] < SOLID) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const p = queue[head++], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= n || label[q] || data[q * 4 + 3] < SOLID) continue;
        label[q] = id;
        queue[tail++] = q;
      }
    }
    sizes.push(tail);
  }
  const least = sizes.reduce((a, b) => Math.max(a, b), 0) * KEEP;
  // Distance from the kept pieces, grown outward a few pixels so their soft edges survive.
  const near = new Uint8Array(n);
  let head = 0, tail = 0;
  for (let p = 0; p < n; p++) if (label[p] && sizes[label[p]] >= least) { near[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (near[p] > EDGE) continue;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= n || near[q]) continue;
      near[q] = near[p] + 1;
      queue[tail++] = q;
    }
  }
  for (let p = 0; p < n; p++) if (!near[p]) data[p * 4 + 3] = 0;
}

addEventListener('message', async (e: MessageEvent<CutoutRequest>) => {
  const { id, blob } = e.data;
  try {
    const remove = await load(id);
    const cut = await remove(await RawImage.fromBlob(blob));
    if (cut.channels === 4) tidy(cut.data as Uint8ClampedArray, cut.width, cut.height);
    postMessage({ id, blob: (await cut.toBlob('image/png')) as Blob } satisfies CutoutReply);
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : 'The background could not be removed.' } satisfies CutoutReply);
  }
});
