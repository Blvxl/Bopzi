import { NextResponse } from 'next/server';
import { SITE_URL } from '@/lib/site';
import { supabaseServer } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/** Where Google and the e-mail links send people back to. Only same-site paths are followed afterwards. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, SITE_URL));
  }
  return NextResponse.redirect(new URL('/?login=failed', SITE_URL));
}
