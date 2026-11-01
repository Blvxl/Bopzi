import { HOSTED_ACCOUNTS } from './config';
import { supabaseServer } from './server';

/** On the website these routes work for signed-in accounts only. On a creator's own computer nothing changes. */
export async function signInRequired() {
  if (!HOSTED_ACCOUNTS) return null;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user ? null : Response.json({ error: 'Log in to use this.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
}
