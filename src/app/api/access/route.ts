import { accessStatus, activate, deactivate, keepForUpdate } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { HOSTED_ACCOUNTS } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Who is signed in on the website. The answer comes from the server checking the sign-in, never from the page. */
async function hostedStatus() {
  const { data } = await (await supabaseServer()).auth.getUser();
  const user = data.user;
  if (!user) return { required: true, signedIn: false };
  return { required: true, signedIn: true, id: user.id, username: user.email?.split('@')[0] ?? 'creator', admin: false };
}

/** Whether this computer has a working license. Only its own pages may ask or change that. */
export async function GET(req: Request) {
  if (HOSTED_ACCOUNTS) return json(await hostedStatus());
  if (!isLocalRequest(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  return json(await accessStatus());
}

export async function POST(req: Request) {
  if (HOSTED_ACCOUNTS) {
    // Signing in and out happens with Supabase directly; nothing here may change anyone's access.
    return json({ error: 'Sign in with your account.' }, 400);
  }
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; key?: unknown };
  if (body.action === 'logout') { deactivate(); return json({ ok: true }); }
  if (body.action === 'keep-for-update') { await keepForUpdate(); return json({ ok: true }); }
  if (body.action !== 'login' || typeof body.key !== 'string') return json({ error: 'Paste your license key.' }, 400);
  try { return json(await activate(body.key)); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'That key did not work.' }, 401); }
}
