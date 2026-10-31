import { loadSoundPack } from '@/video/sound-pack';
import { soundPackRoot } from '@/video/render';
import { failed, refused } from '../library/guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The creator's own sound pack: effects and music, with where it lives so the editor can say so. */
export async function GET(req: Request) {
  const no = refused(req); if (no) return no;
  try { return Response.json({ root: soundPackRoot(), sounds: await loadSoundPack() }, { headers: { 'cache-control': 'no-store' } }); }
  catch (e) { return failed(e, 'Your sounds could not be read.', 500); }
}
