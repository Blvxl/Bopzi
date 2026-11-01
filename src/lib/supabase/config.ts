/** Public by design: the project URL and the publishable key. Never put a service-role key in NEXT_PUBLIC_ settings. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** With a Supabase project configured, Bopzi runs as a website with free accounts; without one it uses license keys. */
export const HOSTED_ACCOUNTS = !!(SUPABASE_URL && SUPABASE_KEY);
