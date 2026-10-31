import { accessStatus, activate, deactivate } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Whether this computer has a working license. Only its own pages may ask or change that. */
export async function GET(req: Request) {
  if (!isLocalRequest(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  return json(await accessStatus());
}

export async function POST(req: Request) {
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; key?: unknown };
  if (body.action === 'logout') { await deactivate(); return json({ ok: true }); }
  if (body.action !== 'login' || typeof body.key !== 'string') return json({ error: 'Paste your license key.' }, 400);
  try { return json(await activate(body.key)); }
  catch (e) { return json({ error: e instanceof Error ? e.message : 'That key did not work.' }, 401); }
}
