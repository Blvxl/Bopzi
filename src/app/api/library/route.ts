import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { libraryDelete, libraryGet, libraryList, libraryPut } from '@/lib/library';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (text: string, status = 200) => new Response(text, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Saves and loads projects on this computer's disk. Only Bopzi's own pages can reach it. */
export async function POST(req: Request) {
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return reply(JSON.stringify({ error: 'This request must come from Bopzi.' }), 403);
  const body = (await req.json().catch(() => ({}))) as { op?: unknown; store?: unknown; key?: unknown; group?: unknown; value?: unknown; onlyIfNew?: unknown };
  try {
    if (body.op === 'get') return reply((await libraryGet(body.store, body.key)) ?? 'null');
    if (body.op === 'list') return reply(await libraryList(body.store, body.group));
    if (body.op === 'put') { await libraryPut(body.store, body.key, body.value, body.group, body.onlyIfNew === true); return reply('{}'); }
    if (body.op === 'delete') { await libraryDelete(body.store, body.key); return reply('{}'); }
    return reply(JSON.stringify({ error: 'Unknown action.' }), 400);
  } catch (e) {
    return reply(JSON.stringify({ error: e instanceof Error ? e.message : 'Could not reach your projects.' }), 400);
  }
}
