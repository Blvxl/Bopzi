import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isLocalRequest } from '@/lib/chatgpt/server';
import { processMedia } from '@/video/render';
export const runtime = 'nodejs';
export const maxDuration = 300;
let working = false;
export async function POST(req: Request) {
  if (!isLocalRequest(req) || req.headers.get('x-bopzi-local') !== '1' || req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Preview copies run on your local Bopzi server.' }, { status: 403 });
  if (working) return Response.json({ error: 'A preview copy is already being made.' }, { status: 409 });
  if (Number(req.headers.get('content-length') ?? 0) > 151 * 1024 * 1024) return Response.json({ error: 'Each video must be under 150 MB.' }, { status: 413 });
  working = true; let dir: string | undefined;
  try {
    const form = await req.formData(), file = form.get('file');
    if (!(file instanceof File) || !file.type.startsWith('video/') || file.size > 150 * 1024 * 1024) throw new Error('Choose a video smaller than 150 MB.');
    dir = await mkdtemp(path.join(os.tmpdir(), 'bopzi-proxy-'));
    await writeFile(path.join(dir, 'source'), Buffer.from(await file.arrayBuffer()));
    await processMedia(process.env.BOPZI_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'source', '-map', '0:v:0', '-map', '0:a?', '-vf', "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', 'preview.mp4'], req.signal, dir);
    return new Response(new Uint8Array(await readFile(path.join(dir, 'preview.mp4'))), { headers: { 'content-type': 'video/mp4', 'cache-control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not make a preview copy.' }, { status: 400 }); }
  finally { working = false; if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {}); }
}
