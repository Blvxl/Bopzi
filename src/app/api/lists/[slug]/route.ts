import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/data';
import { buildList } from '@/lib/lists';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

/** One list, built from the collected data. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const file = dbPath();
  if (!existsSync(file)) return Response.json({ error: 'No local collection yet.' }, { status: 404, headers });
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const list = await buildList(db, slug);
    if (!list) return Response.json({ error: 'No such list.' }, { status: 404, headers });
    return Response.json(list, { headers });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not build the list.' }, { status: 500, headers });
  } finally { db.close(); }
}
