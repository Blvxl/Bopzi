import { prepareRefine, prepareThumbnail } from '@/lib/thumbnail/server';
import { parseThumbnailBrief, parseThumbnailRefine } from '@/lib/thumbnail/prompt';
import { isSameOriginCall } from '@/lib/chatgpt/server';
import { signInRequired } from '@/lib/supabase/require';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

// Works out a request (the words, the images in order, the shape) and generates nothing.
// The page then hands it to the Bopzi helper on the visitor's own computer, which makes the image on their plan.
export async function POST(req: Request) {
  const denied = await signInRequired();
  if (denied) return denied;
  if (!isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (Number(req.headers.get('content-length') ?? 0) > 36_000_000) return json({ error: 'Reference images are too large.' }, 413);
  try {
    const raw = await req.json();
    return json(raw && typeof raw === 'object' && 'refine' in raw ? prepareRefine(parseThumbnailRefine((raw as { refine: unknown }).refine)) : await prepareThumbnail(parseThumbnailBrief(raw)));
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Invalid request.' }, 400); }
}
