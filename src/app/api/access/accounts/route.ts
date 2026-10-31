import { isOwner } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { issue, listIssued, setDisabled } from '@/lib/licenses';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Making and disabling keys needs the owner's private key, so this only works on the owner's computer. */
export async function POST(req: Request) {
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (!(await isOwner())) return json({ error: 'Only the owner can do that.' }, 403);
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; id?: unknown; username?: unknown; device?: unknown };
  try {
    if (body.action === 'list') return json({ licenses: await listIssued() });
    if (body.action === 'add') return json(await issue(String(body.username ?? ''), String(body.device ?? '')));
    if (body.action === 'disable' || body.action === 'enable') return json(await setDisabled(String(body.id ?? ''), body.action === 'disable'));
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'That did not work. Try again.' }, 400);
  }
}
