import { isAdmin } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { issue, listIssued, remove, setDeal, setDisabled } from '@/lib/licenses';
import { dealGame } from '@/lib/thumbnail/references';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** The admin panel's actions. They need the owner's signing key and the owner's ChatGPT account together. */
export async function POST(req: Request) {
  if (!isLocalRequest(req) || !isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (!(await isAdmin())) return json({ error: 'Only the owner can do that.' }, 403);
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; id?: unknown; username?: unknown; device?: unknown; deal?: unknown };
  try {
    if (body.action === 'list') {
      const licenses = (await listIssued()).filter((l) => !l.removed);
      return json({ licenses: await Promise.all(licenses.map(async (l) => ({ ...l, game: l.deal ? await dealGame(l.deal.game) : null }))) });
    }
    if (body.action === 'add') return json(await issue(String(body.username ?? ''), String(body.device ?? ''), body.deal));
    if (body.action === 'disable' || body.action === 'enable') return json(await setDisabled(String(body.id ?? ''), body.action === 'disable'));
    if (body.action === 'deal') return json(await setDeal(String(body.id ?? ''), body.deal));
    if (body.action === 'remove') return json(await remove(String(body.id ?? '')));
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'That did not work. Try again.' }, 400);
  }
}
