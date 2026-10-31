import { pipeline } from '@huggingface/transformers';

/**
 * Speech to text for captions, off the main thread. Whisper is fetched from Hugging Face the first time and kept by
 * the browser afterwards; the audio itself never leaves this computer. The timestamped export is the one that gives
 * each word its own start and end, which is what captions need.
 */
const MODEL = 'onnx-community/whisper-base_timestamped';

export type Word = { text: string; start: number; end: number };
export type TranscribeRequest = { id: number; audio: Float32Array };
export type TranscribeReply = { id: number; words: Word[] } | { id: number; error: string } | { id: number; progress: number };

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;
let transcriber: Promise<Transcriber> | null = null;

function load(id: number) {
  const progress_callback = (p: { status?: string; file?: string; progress?: number }) => {
    if (p.status === 'progress' && p.file?.endsWith('.onnx') && typeof p.progress === 'number') postMessage({ id, progress: p.progress } satisfies TranscribeReply);
  };
  // The graphics card is much faster where the browser offers it; everywhere else the CPU build runs.
  const make = (device: 'webgpu' | 'wasm', dtype: string | Record<string, string>) => pipeline('automatic-speech-recognition', MODEL, { device, dtype: dtype as 'fp32', progress_callback }) as unknown as Promise<Transcriber>;
  // On the graphics card a 4-bit decoder makes the word-by-word part several times faster at the same accuracy for
  // speech; the full-precision encoder keeps the timings right. Older setups fall back step by step.
  transcriber ??= ('gpu' in navigator
    ? make('webgpu', { encoder_model: 'fp32', decoder_model_merged: 'q4' }).catch(() => make('webgpu', 'fp32')).catch(() => make('wasm', 'q8'))
    : make('wasm', 'q8')).catch((e) => {
    // A failed download must not stick: the next try starts again.
    transcriber = null;
    throw e;
  });
  return transcriber;
}

addEventListener('message', async (e: MessageEvent<TranscribeRequest>) => {
  const { id, audio } = e.data;
  try {
    const transcribe = await load(id);
    const result = await transcribe(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    const words = (result.chunks ?? []).map(c => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + .4 })).filter(w => w.text && Number.isFinite(w.start));
    postMessage({ id, words } satisfies TranscribeReply);
  } catch (err) {
    postMessage({ id, error: err instanceof Error ? err.message : 'The speech could not be transcribed.' } satisfies TranscribeReply);
  }
});
