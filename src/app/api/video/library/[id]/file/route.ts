import { playable, serveFile } from '@/video/library';
import { failed, refused } from '../../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The picture and sound the editor plays, with range requests so the preview can seek anywhere. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(req); if (no) return no;
  try { return await serveFile(await playable((await params).id), req); }
  catch (e) { return failed(e, 'This media could not be opened.', 404); }
}
