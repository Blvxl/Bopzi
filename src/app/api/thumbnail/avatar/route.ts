import { avatarReference } from '@/lib/thumbnail/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Looks up a Roblox user's public avatar render so it can be used as a character reference.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; userId?: unknown };
  try {
    const who = typeof body.userId === 'number' ? { userId: body.userId } : { username: typeof body.username === 'string' ? body.username : '' };
    return Response.json(await avatarReference(who), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'That avatar could not be loaded.' }, { status: 400 });
  }
}
