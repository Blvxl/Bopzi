import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isLocalRequest } from '@/lib/chatgpt/server';
import { renderVideo } from '@/video/render';
import { exportFolder, originalOf } from '@/video/library';
import { loadSoundPack } from '@/video/sound-pack';
import { duration, validateTimeline, type MediaInfo } from '@/video/model';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let rendering = false;

/** A free name in the export folder: "My video.mp4", then "My video (2).mp4" and so on. */
async function freeName(folder: string, name: string) {
  const base = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().slice(0, 80) || 'Bopzi video';
  for (let n = 1; ; n++) { const file = path.join(folder, n === 1 ? `${base}.mp4` : `${base} (${n}).mp4`); if (!await stat(file).catch(() => null)) return file; }
}

/**
 * Renders the cut from the original files and saves it in Videos\Bopzi. Media on disk is read where it is; media kept
 * in the browser (images, built-in sounds) arrives with the request. The answer is a line per update: progress, then
 * the saved file or what went wrong.
 */
export async function POST(req: Request) {
  if (!isLocalRequest(req) || req.headers.get('x-bopzi-local') !== '1' || req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Video export runs on your local Bopzi server.' }, { status: 403 });
  if (rendering) return Response.json({ error: 'An export is already running. Please wait for it to finish.' }, { status: 409 });
  rendering = true;
  const stop = new AbortController(), signal = AbortSignal.any([req.signal, stop.signal]), text = new TextEncoder();
  const lines = new ReadableStream<Uint8Array>({
    async start(out) {
      const line = (body: unknown) => { try { out.enqueue(text.encode(JSON.stringify(body) + '\n')); } catch { /* the page has gone */ } };
      let directory: string | undefined;
      try {
        const form = await req.formData(); const raw: unknown = JSON.parse(String(form.get('assets')));
        if (!Array.isArray(raw) || raw.length > 200) throw new Error('Invalid media list.');
        const assets: (MediaInfo & { diskId?: string })[] = raw.map((a: MediaInfo & { diskId?: unknown }) => { if (!a || typeof a.id !== 'string' || !/^[\w-]{1,100}$/.test(a.id) || typeof a.name !== 'string' || !['video', 'image', 'audio'].includes(a.kind) || !Number.isFinite(a.duration) || a.duration <= 0 || (a.diskId !== undefined && typeof a.diskId !== 'string')) throw new Error('Invalid media information.'); return { id: a.id, name: a.name.slice(0, 180), kind: a.kind, duration: a.duration, width: a.width, height: a.height, ...(a.diskId ? { diskId: a.diskId as string } : {}) }; });
        if (new Set(assets.map(a => a.id)).size !== assets.length) throw new Error('Duplicate media IDs.');
        await loadSoundPack(); // so sounds from the creator's own pack count as known sounds
        const timeline = validateTimeline(JSON.parse(String(form.get('timeline'))), assets); if (duration(timeline) < .1) throw new Error('Add a clip before exporting.');
        directory = await mkdtemp(path.join(os.tmpdir(), 'bopzi-video-'));
        const files = new Map<string, string>();
        for (const [i, a] of assets.entries()) {
          if (a.diskId) { files.set(a.id, (await originalOf(a.diskId)).path); continue; }
          const file = form.get(a.id); if (!(file instanceof File)) throw new Error(`Missing file: ${a.name}`);
          const target = path.join(directory, `source-${i}`); await writeFile(target, Buffer.from(await file.arrayBuffer())); files.set(a.id, target);
        }
        // The layers over the footage: distinct pictures and how long each one holds, drawn by the browser. `below` and
        // `matte` only come with text behind the player: the titles under the object and the object's cut-out shape.
        const layer = async (name: 'motion' | 'below' | 'matte') => {
          const holds: unknown = JSON.parse(String(form.get(name) ?? '[]'));
          if (!Array.isArray(holds) || holds.length > 200000 || !holds.every(d => typeof d === 'number' && Number.isFinite(d) && d > 0 && d <= 7200)) throw new Error('Invalid animation layer.');
          if (holds.reduce((s: number, d: number) => s + d, 0) > duration(timeline) + 1) throw new Error('The animation layer is longer than the video.');
          const frames: { file: string; duration: number }[] = [];
          for (const [i, d] of (holds as number[]).entries()) { const image = form.get(`${name}-${i}`); if (!(image instanceof File) || image.size > 12_000_000) throw new Error('Invalid animation frame.'); await writeFile(path.join(directory!, `${name}-${i}.png`), Buffer.from(await image.arrayBuffer())); frames.push({ file: `${name}-${i}.png`, duration: d }); }
          return frames;
        };
        const motion = await layer('motion'), below = await layer('below'), matte = await layer('matte');
        let last = -1;
        const rendered = await renderVideo(timeline, assets, files, motion, directory, signal, below.length && matte.length ? { below, matte } : undefined, share => { const p = Math.floor(share * 100); if (p !== last) { last = p; line({ progress: share }); } });
        const folder = exportFolder(); await mkdir(folder, { recursive: true });
        const target = await freeName(folder, timeline.name);
        // Another drive cannot take a rename.
        await rename(rendered, target).catch(async () => { await copyFile(rendered, target); });
        line({ done: true, file: target, name: path.basename(target), bytes: (await stat(/*turbopackIgnore: true*/ target)).size });
      } catch (e) { line({ error: signal.aborted ? 'Export cancelled.' : e instanceof Error ? e.message : 'The export failed.' }); }
      finally { rendering = false; if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {}); try { out.close(); } catch { /* already closed */ } }
    },
    // Closing the page, or pressing Cancel there, stops FFmpeg too.
    cancel() { stop.abort(); },
  });
  return new Response(lines, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
