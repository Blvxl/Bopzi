import { isLocalRequest } from '@/lib/chatgpt/server';
import { connectedPicture } from '@/lib/thumbnail/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The ChatGPT profile picture, for an <img> on this computer's own pages. Tags send no custom header, so Fetch Metadata guards it. */
export async function GET(req: Request) {
  if (!isLocalRequest(req) || ['cross-site', 'same-site'].includes(req.headers.get('sec-fetch-site') ?? '')) return new Response(null, { status: 403 });
  const picture = await connectedPicture();
  if (!picture) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(picture.bytes, { headers: { 'content-type': picture.type, 'cache-control': 'private, max-age=600' } });
}
