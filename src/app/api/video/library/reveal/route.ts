import { reveal } from '@/video/library';
import { failed, refused } from '../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shows a finished export in Explorer. */
export async function POST(req: Request) {
  const no = refused(req, true); if (no) return no;
  try { const { file } = await req.json(); if (typeof file !== 'string') throw new Error('Missing file.'); await reveal(file); return Response.json({ shown: true }); }
  catch (e) { return failed(e, 'The export could not be shown.'); }
}
