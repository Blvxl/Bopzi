import { avatarReference } from '@/lib/thumbnail/avatar';
import { signInRequired } from '@/lib/supabase/require';
import { callerOf, tooMany } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Looks up a Roblox user's public avatar render so it can be used as a character reference.
export async function POST(req: Request) {
  const denied = await signInRequired();
  if (denied) return denied;
  if (tooMany(`avatar:${callerOf(req)}`, 30, 60_000)) return Response.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; userId?: unknown };
  try {
    const who = typeof body.userId === 'number' ? { userId: body.userId } : { username: typeof body.username === 'string' ? body.username : '' };
    return Response.json(await avatarReference(who), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'That avatar could not be loaded.' }, { status: 400 });
  }
}
