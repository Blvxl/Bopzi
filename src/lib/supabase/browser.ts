import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: ReturnType<typeof createBrowserClient> | undefined;
export const supabaseBrowser = () => (client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY));
