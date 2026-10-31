import { previewStatus, queuePreview } from '@/video/library';
import { failed, refused } from '../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How far along the preview copy is. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(req); if (no) return no;
  try { return Response.json(await previewStatus((await params).id), { headers: { 'cache-control': 'no-store' } }); }
  catch (e) { return failed(e, 'Unknown media.', 404); }
}

/** Tries a failed preview copy again. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = refused(req, true); if (no) return no;
  try { const { id } = await params; await previewStatus(id); queuePreview(id); return Response.json({ queued: true }); }
  catch (e) { return failed(e, 'Unknown media.', 404); }
}
