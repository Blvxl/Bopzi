import { LISTS } from '@/lib/lists';

export const dynamic = 'force-dynamic';

/** The lists the site offers. */
export async function GET() {
  return Response.json({ lists: LISTS }, { headers: { 'Cache-Control': 'no-store' } });
}
