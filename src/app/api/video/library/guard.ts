import { isLocalRequest } from '@/lib/chatgpt/server';

/**
 * The library reads and writes files on this computer, so only Bopzi's own pages on this computer may use it.
 * Reads come from <video> and <img> tags, which send no custom header, so they are checked by Fetch Metadata instead.
 */
export function refused(req: Request, write = false) {
  if (!isLocalRequest(req)) return Response.json({ error: 'The media library only runs on your own computer.' }, { status: 403 });
  if (write ? req.headers.get('x-bopzi-local') !== '1' || req.headers.get('origin') !== new URL(req.url).origin : ['cross-site', 'same-site'].includes(req.headers.get('sec-fetch-site') ?? ''))
    return Response.json({ error: 'This request must come from Bopzi.' }, { status: 403 });
  return null;
}

export const failed = (e: unknown, fallback: string, status = 400) => Response.json({ error: e instanceof Error ? e.message : fallback }, { status });
