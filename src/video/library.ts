import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { processMedia } from './render';
import type { MediaKind } from './model';

/**
 * Footage that stays where it is on this computer. Bopzi keeps only a small folder per file in ~/.bopzi/media:
 * where the original lives, what FFprobe found, a poster, and a lightweight preview copy the browser plays.
 * Export reads the original, so no recording is ever copied into the browser or uploaded to the server.
 */

export type LibraryEntry = { id: string; path: string; name: string; kind: MediaKind; duration: number; width: number; height: number; audio: boolean; size: number; mtime: number; owned?: boolean };

const ffmpeg = () => process.env.BOPZI_FFMPEG || 'ffmpeg';
const ffprobe = () => process.env.BOPZI_FFPROBE || 'ffprobe';
export const libraryRoot = () => process.env.BOPZI_MEDIA_DIR || path.join(homedir(), '.bopzi', 'media');
const ID = /^[0-9a-f-]{36}$/;
const folder = (id: string) => { if (!ID.test(id)) throw new Error('Unknown media.'); return path.join(libraryRoot(), id); };
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
export const MEDIA_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.flv', '.ts', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', ...IMAGE];

/** What FFprobe says about a file, as an entry; nothing is written. */
async function probe(file: string): Promise<Omit<LibraryEntry, 'id' | 'path' | 'name' | 'size' | 'mtime'>> {
  const info = JSON.parse(await processMedia(ffprobe(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], undefined, undefined, 60000));
  type Stream = { codec_type: string; width?: number; height?: number; disposition?: { attached_pic?: number }; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } };
  const streams: Stream[] = info.streams ?? [];
  // Cover art in an MP3 shows up as a video stream; it is not footage.
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic), audio = streams.some(s => s.codec_type === 'audio');
  const still = IMAGE.has(path.extname(file).toLowerCase());
  const kind: MediaKind = still ? 'image' : video ? 'video' : audio ? 'audio' : (() => { throw new Error(`“${path.basename(file)}” has no picture or sound Bopzi can read.`); })();
  const duration = still ? 4 : Number(info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`“${path.basename(file)}” has no readable duration.`);
  // Phone recordings store portrait video sideways with a rotation flag.
  const turn = Math.abs(Number(video?.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0)) % 180 === 90;
  const width = video?.width ?? 0, height = video?.height ?? 0;
  return { kind, duration, width: turn ? height : width, height: turn ? width : height, audio };
}

export async function getEntry(id: string): Promise<LibraryEntry> {
  try { return JSON.parse(await readFile(path.join(folder(id), 'entry.json'), 'utf8')); }
  catch { throw new Error('This media is no longer in the Bopzi library.'); }
}

/** The original file, after checking it is still the one that was added. */
export async function originalOf(id: string) {
  const entry = await getEntry(id);
  const now = await stat(entry.path).catch(() => null);
  if (!now) throw new Error(`“${entry.name}” is no longer at ${entry.path}. Put it back or add it again.`);
  if (now.size !== entry.size) throw new Error(`“${entry.name}” has changed since it was added. Add it again.`);
  return entry;
}

/** Adds a file by its path on this computer. `owned` marks a copy Bopzi made itself (a dropped file). */
export async function addFile(file: string, owned = false): Promise<LibraryEntry & { poster?: string }> {
  if (!path.isAbsolute(file)) throw new Error('Use the full path to the file.');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new Error(`No file at ${file}.`);
  if (!MEDIA_EXTENSIONS.includes(path.extname(file).toLowerCase())) throw new Error(`“${path.basename(file)}” is not a video, audio or image file Bopzi supports.`);
  const entry: LibraryEntry = { id: randomUUID(), path: file, name: path.basename(file), size: info.size, mtime: info.mtimeMs, ...(owned ? { owned } : {}), ...await probe(file) };
  const dir = folder(entry.id); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'entry.json'), JSON.stringify(entry, null, 1));
  const poster = await makePoster(entry).catch(() => undefined);
  if (entry.kind === 'video') queuePreview(entry.id);
  return { ...entry, poster };
}

async function makePoster(entry: LibraryEntry) {
  if (entry.kind === 'audio') return undefined;
  const out = path.join(folder(entry.id), 'poster.jpg');
  await processMedia(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...(entry.kind === 'video' ? ['-ss', String(Math.min(1, entry.duration / 2))] : []), '-i', entry.path, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', out], undefined, undefined, 60000);
  return `data:image/jpeg;base64,${(await readFile(out)).toString('base64')}`;
}

/** Streams a dropped file into the library as a file of its own, then adds it like any other. */
export async function addUpload(name: string, body: ReadableStream<Uint8Array>) {
  const clean = path.basename(name).replace(/[^\w .()-]/g, '_').slice(0, 120) || 'media';
  if (!MEDIA_EXTENSIONS.includes(path.extname(clean).toLowerCase())) throw new Error(`“${clean}” is not a video, audio or image file Bopzi supports.`);
  const dir = path.join(libraryRoot(), 'uploads', randomUUID()); await mkdir(dir, { recursive: true });
  const target = path.join(dir, clean);
  const { pipeline } = await import('node:stream/promises'), { createWriteStream } = await import('node:fs');
  try { await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), createWriteStream(target)); return await addFile(target, true); }
  catch (e) { await rm(dir, { recursive: true, force: true }).catch(() => {}); throw e; }
}

// ---- preview copies ----
// One at a time: each one already uses every core, and the first file added is the one wanted first.
type Job = { percent: number; error?: string };
const jobs = new Map<string, Job>(); const queue: string[] = []; let working = false;
const previewFile = (id: string) => path.join(folder(id), 'preview.mp4');
export const hasPreview = (id: string) => stat(previewFile(id)).then(() => true, () => false);

export function queuePreview(id: string) {
  if (jobs.has(id) && !jobs.get(id)!.error) return;
  jobs.set(id, { percent: 0 }); queue.push(id); void work();
}
async function work() {
  if (working) return; working = true;
  try {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const job = jobs.get(id)!;
      try { await makePreview(id, p => { job.percent = p; }); jobs.delete(id); }
      catch (e) { job.error = e instanceof Error ? e.message : 'The preview copy failed.'; }
    }
  } finally { working = false; }
}
/**
 * A 540p copy with a keyframe every second, so scrubbing lands at once anywhere in an hours-long recording.
 * The originals stay untouched and are what export uses.
 */
async function makePreview(id: string, onProgress: (percent: number) => void) {
  const entry = await originalOf(id), part = path.join(folder(id), 'preview.part.mp4');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', entry.path, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '27', '-g', '30', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', part], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let error = '';
    child.stdout.on('data', d => { const m = /out_time_us=(\d+)/.exec(String(d)); if (m) onProgress(Math.min(99, Math.round(Number(m[1]) / 1e4 / entry.duration))); });
    child.stderr.on('data', d => { error = (error + d).slice(-2000); });
    child.on('error', () => reject(new Error('FFmpeg was not found. Install FFmpeg on this computer and restart Bopzi.')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`The preview copy failed. ${error.trim().split('\n').at(-1) ?? ''}`)));
  });
  await rename(part, previewFile(id));
}

export async function previewStatus(id: string) {
  await getEntry(id);
  if (await hasPreview(id)) return { ready: true, percent: 100 };
  const job = jobs.get(id);
  if (!job) { const entry = await getEntry(id); if (entry.kind === 'video') queuePreview(id); return { ready: false, percent: 0 }; }
  return { ready: false, percent: job.percent, ...(job.error ? { error: job.error } : {}) };
}

// ---- serving ----
const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' };

/** A file with HTTP range support, which is what lets a video element seek without reading everything before. */
export async function serveFile(file: string, req: Request) {
  const { size } = await stat(file), type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  const headers: Record<string, string> = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!range) return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, 'content-length': String(size) } });
  let start = range[1] ? Number(range[1]) : size - Number(range[2]), end = range[1] && range[2] ? Number(range[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}` } });
}

/** What the browser plays: the preview copy once it exists, otherwise the original (most recordings play directly). */
export async function playable(id: string) {
  return await hasPreview(id) ? previewFile(id) : (await originalOf(id)).path;
}

// ---- sound for the browser's analysis ----
/** Mono 32-bit float samples at `rate`, from `from` for `length` seconds, decoded by FFmpeg as it streams. */
export async function samples(id: string, rate: number, from = 0, length?: number) {
  const entry = await originalOf(id);
  if (!entry.audio) return null;
  const child = spawn(/*turbopackIgnore: true*/ ffmpeg(), ['-hide_banner', '-loglevel', 'error', ...(from > 0 ? ['-ss', String(from)] : []), '-i', entry.path, ...(length ? ['-t', String(length)] : []), '-vn', '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return { stream: child.stdout, stop: () => child.kill() };
}

/** Loudness in dB, a quarter second per value, the same measure ai-context.ts takes; kept with the entry. */
export async function loudnessOf(id: string): Promise<number[] | null> {
  const cache = path.join(folder(id), 'loudness.json');
  try { return JSON.parse(await readFile(cache, 'utf8')); } catch { /* not measured yet */ }
  const RATE = 8000, HOP = RATE / 4, source = await samples(id, RATE);
  if (!source) return null;
  const out: number[] = []; let sum = 0, count = 0, carry: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  for await (const chunk of source.stream as AsyncIterable<Buffer>) {
    const data = carry.length ? Buffer.concat([carry, chunk]) : chunk, whole = data.length - (data.length % 4);
    for (let i = 0; i < whole; i += 4) { const v = data.readFloatLE(i); sum += v * v; if (++count === HOP) { out.push(Math.max(-60, Math.round(10 * Math.log10(sum / HOP + 1e-12)))); sum = 0; count = 0; } }
    carry = data.subarray(whole);
  }
  await writeFile(cache, JSON.stringify(out));
  return out;
}

// ---- choosing files and folders ----
/**
 * The Windows file picker, opened by the server since it runs on this computer: it gives real paths, which a
 * browser never hands out. Null on other systems, where the path is typed instead.
 */
export async function pickFiles(): Promise<string[] | null> {
  if (process.platform !== 'win32') return null;
  const filter = `Media|${MEDIA_EXTENSIONS.map(e => '*' + e).join(';')}|All files|*.*`;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    // An invisible topmost owner, so the dialog opens in front of the browser instead of behind it.
    '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Opacity = 0 }',
    '$owner.Show(); $owner.Activate()',
    `$d = New-Object System.Windows.Forms.OpenFileDialog -Property @{ Multiselect = $true; Title = 'Add footage to Bopzi'; Filter = '${filter}' }`,
    'if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.FileNames | ForEach-Object { [Console]::WriteLine($_) } }',
    '$owner.Close()',
  ].join('; ');
  const out = await processMedia('powershell.exe', ['-NoProfile', '-STA', '-NonInteractive', '-Command', script], undefined, undefined, 30 * 60000);
  return out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

/** Where exports go: the Videos folder, in a Bopzi folder of its own. */
export const exportFolder = () => process.env.BOPZI_EXPORT_DIR || path.join(homedir(), 'Videos', 'Bopzi');

/** Shows a finished export in Explorer, selected. Only files in the export folder. */
export async function reveal(file: string) {
  const resolved = path.resolve(/*turbopackIgnore: true*/ file);
  if (path.dirname(resolved) !== path.resolve(/*turbopackIgnore: true*/ exportFolder())) throw new Error('Only exports can be shown.');
  await stat(/*turbopackIgnore: true*/ resolved);
  if (process.platform === 'win32') spawn('explorer.exe', [`/select,${resolved}`], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [path.dirname(resolved)], { detached: true, stdio: 'ignore' }).unref();
}
