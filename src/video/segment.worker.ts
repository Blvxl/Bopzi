import { AutoProcessor, EdgeTamModel, RawImage, type Tensor } from '@huggingface/transformers';
import { objectPrompts } from './mask';

/**
 * Cuts one object out of one picture, off the main thread. EdgeTAM (a small Segment Anything 2 made for phones) is
 * fetched from Hugging Face the first time and kept by the browser afterwards; the footage never leaves this computer.
 * The caller walks it through the frames one by one, prompting each frame from the last (track.ts).
 */
const MODEL = 'onnx-community/EdgeTAM-ONNX';

/** Box is x1, y1, x2, y2 and points are x, y, all in pixels of the picture sent. Without a box, the points alone. */
export type SegmentRequest = { id: number; width: number; height: number; pixels: Uint8ClampedArray; box?: [number, number, number, number]; points?: [number, number][]; labels?: number[] };
/** Up to three candidate cut-outs (width × height, 1 inside), best first, each with how sure the model is. */
export type SegmentReply = { id: number; masks: Uint8Array[]; scores: number[]; present: boolean } | { id: number; error: string } | { id: number; progress: number };

type Model = { (inputs: Record<string, unknown>): Promise<{ iou_scores: Tensor; pred_masks: Tensor; object_score_logits?: Tensor }> };
type Processor = { (image: RawImage, options: Record<string, unknown>): Promise<Record<string, unknown> & { original_sizes: [number, number][]; reshaped_input_sizes: [number, number][] }>; post_process_masks: (masks: Tensor, original: [number, number][], reshaped: [number, number][]) => Promise<Tensor[]> };
let loaded: Promise<{ model: Model; processor: Processor }> | null = null;

function load(id: number) {
  const progress_callback = (p: { status?: string; file?: string; progress?: number }) => {
    if (p.status === 'progress' && p.file?.includes('.onnx') && typeof p.progress === 'number') postMessage({ id, progress: p.progress } satisfies SegmentReply);
  };
  // The graphics card is much faster where the browser offers it; everywhere else the CPU build runs.
  const make = async (device: 'webgpu' | 'wasm') => ({
    model: await EdgeTamModel.from_pretrained(MODEL, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback }) as unknown as Model,
    processor: await AutoProcessor.from_pretrained(MODEL) as unknown as Processor,
  });
  loaded ??= ('gpu' in navigator ? make('webgpu').catch(() => make('wasm')) : make('wasm')).catch(e => {
    // A failed download must not stick: the next try starts again.
    loaded = null;
    throw e;
  });
  return loaded;
}

self.onmessage = async (event: MessageEvent<SegmentRequest>) => {
  const { id, width, height, pixels, box, points, labels } = event.data;
  try {
    const { model, processor } = await load(id);
    const image = new RawImage(pixels, width, height, 4).rgb();
    // Clicks alone, when there are any: a box as big as the frame would tell the model the object fills the frame,
    // and it answers with scene-sized regions. Otherwise the box, with a seed in its middle and the outside excluded.
    const inputs = box ? await (() => { const prompts = objectPrompts(box, width, height, points, labels); return processor(image, { input_boxes: [[box]], input_points: [[prompts.points]], input_labels: [[prompts.labels]] }); })()
      : await processor(image, { input_points: [[points ?? [[width / 2, height / 2]]]], input_labels: [[labels ?? (points ?? [0]).map(() => 1)]] });
    const out = await model(inputs);
    const [masks] = await processor.post_process_masks(out.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
    const scores = Array.from(out.iou_scores.data as Float32Array), size = width * height, data = masks.data as Uint8Array;
    const candidates = scores.map((score, i) => ({ score, mask: data.slice(i * size, (i + 1) * size) })).sort((a, b) => b.score - a.score);
    const present = !out.object_score_logits || (out.object_score_logits.data as Float32Array)[0] > 0;
    postMessage({ id, masks: candidates.map(c => c.mask), scores: candidates.map(c => c.score), present } satisfies SegmentReply, { transfer: candidates.map(c => c.mask.buffer as ArrayBuffer) });
  } catch (e) {
    postMessage({ id, error: e instanceof Error ? e.message : 'The object could not be found.' } satisfies SegmentReply);
  }
};
