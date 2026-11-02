import { createClient } from '@supabase/supabase-js';
import { callerOf, tooMany } from '@/lib/rate-limit';
import { HOSTED_ACCOUNTS, SUPABASE_URL } from '@/lib/supabase/config';
import { supabaseServer } from '@/lib/supabase/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only Bopzi's own pages may call this: the browser's Origin must match this host. */
function isSameOriginCall(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host); } catch { return false; }
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Deletes the signed-in person's own account. The secret key lives only in the server's settings, and the
 * account to delete always comes from the verified sign-in, never from the request.
 */
export async function POST(req: Request) {
  if (!HOSTED_ACCOUNTS) return json({ error: 'Accounts are only on the website.' }, 404);
  if (!isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (tooMany(`delete:${callerOf(req)}`, 5, 60_000)) return json({ error: 'Too many requests. Wait a minute.' }, 429);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return json({ error: 'Account deletion is not set up yet. Contact support.' }, 503);

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return json({ error: 'Log in first.' }, 401);

  const admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return json({ error: 'The account could not be deleted. Try again or contact support.' }, 500);
  await supabase.auth.signOut();
  return json({ ok: true });
}
