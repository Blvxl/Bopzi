import { packFile } from '@/video/sound-pack';
import { serveFile } from '@/video/library';
import { failed, refused } from '../../library/guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One file of the sound pack, only by a name the pack lists. */
export async function GET(req: Request) {
  const no = refused(req); if (no) return no;
  try {
    const file = await packFile(new URL(req.url).searchParams.get('f') ?? '');
    return file ? await serveFile(file, req) : Response.json({ error: 'No such sound.' }, { status: 404 });
  } catch (e) { return failed(e, 'This sound could not be played.', 404); }
}
