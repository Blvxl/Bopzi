import { hasAccess } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { cancelSignIn, signIn, signOut } from '@/lib/thumbnail/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Signing in and out of ChatGPT through Codex. Only Bopzi's own pages on this computer may ask. */
export async function POST(req: Request) {
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (!(await hasAccess())) return json({ error: 'Sign in to Bopzi first.' }, 401);
  const { action } = (await req.json().catch(() => ({}))) as { action?: unknown };
  try {
    if (action === 'login') return json({ url: await signIn() });
    if (action === 'logout') { await signOut(); return json({ ok: true }); }
    if (action === 'cancel') { cancelSignIn(); return json({ ok: true }); }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'That did not work. Try again.' }, 500);
  }
  return json({ error: 'Unknown action.' }, 400);
}
