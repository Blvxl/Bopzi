import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { HOSTED_ACCOUNTS, SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

/** Keeps the sign-in fresh while someone browses. It decides nothing about who may see what. */
export async function proxy(request: NextRequest) {
  if (!HOSTED_ACCOUNTS) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|showcase/|.*\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)'] };
