import { addUpload } from '@/video/library';
import { failed, refused } from '../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A dropped file: the browser has no path for it, so its bytes are streamed into the library folder. Any size. */
export async function PUT(req: Request) {
  const no = refused(req, true); if (no) return no;
  const name = new URL(req.url).searchParams.get('name');
  if (!name || !req.body) return Response.json({ error: 'Missing file.' }, { status: 400 });
  try { return Response.json({ added: await addUpload(name, req.body) }); }
  catch (e) { return failed(e, 'The file could not be added.'); }
}
