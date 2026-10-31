import { loudnessOf } from '@/video/library';
import { failed, refused } from '../../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A file's loudness, a value per quarter second, measured once by FFmpeg and kept. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(req); if (no) return no;
  try { return Response.json({ db: await loudnessOf((await params).id) }); }
  catch (e) { return failed(e, 'The loudness could not be measured.', 404); }
}
