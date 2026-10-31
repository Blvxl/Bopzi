import { Readable } from 'node:stream';
import { samples } from '@/video/library';
import { failed, refused } from '../../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Mono float samples for analysis in the browser (speech, beats), only the range asked for. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(req); if (no) return no;
  const q = new URL(req.url).searchParams, rate = Number(q.get('rate')), from = Number(q.get('from') ?? 0), length = q.has('length') ? Number(q.get('length')) : undefined;
  if (![8000, 11025, 16000, 22050].includes(rate) || !(from >= 0) || (length !== undefined && !(length > 0))) return Response.json({ error: 'Invalid sample request.' }, { status: 400 });
  try {
    const found = await samples((await params).id, rate, from, length);
    if (!found) return new Response(null, { status: 204 });
    req.signal.addEventListener('abort', found.stop, { once: true });
    return new Response(Readable.toWeb(found.stream) as ReadableStream, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' } });
  } catch (e) { return failed(e, 'The sound could not be read.', 404); }
}
