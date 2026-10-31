import { hasAccess } from '@/lib/access';
import { isLocalRequest, isSameOriginCall } from '@/lib/chatgpt/server';
import { connectedAccount, connectionStatus, makeImage, prepareRefine, prepareThumbnail, type Prepared } from '@/lib/thumbnail/server';
import { parseThumbnailBrief, parseThumbnailRefine } from '@/lib/thumbnail/prompt';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
let generating = false;
export async function GET(req: Request) {
  // `local` tells the page whether this Bopzi runs on the visitor's own computer. If not, it looks for the helper.
  if (!isLocalRequest(req)) return json({ connected: false, local: false, reason: 'Connect your own ChatGPT plan to generate here.' });
  const status = await connectionStatus();
  return json({ ...status, local: true, account: status.connected ? await connectedAccount() : null });
}
export async function POST(req: Request) {
  if (!isLocalRequest(req)) return json({ error: 'This Bopzi cannot generate by itself. Connect your own ChatGPT plan with the Bopzi helper.' }, 403);
  if (!isSameOriginCall(req)) return json({ error: 'This request must come from Bopzi.' }, 403);
  if (!(await hasAccess())) return json({ error: 'Sign in to Bopzi first.' }, 401);
  const status = await connectionStatus();
  if (!status.connected) return json({ error: status.reason, signInRequired: true }, 401);
  if (generating) return json({ error: 'An image is already being generated. Wait for it to finish.' }, 409);
  if (Number(req.headers.get('content-length') ?? 0) > 36_000_000) return json({ error: 'Reference images are too large.' }, 413);
  let job: Prepared;
  generating = true;
  try {
    const raw: unknown = await req.json();
    // A refine carries the current image and one instruction; anything else is a full brief.
    job = raw && typeof raw === 'object' && 'refine' in raw ? prepareRefine(parseThumbnailRefine((raw as { refine: unknown }).refine)) : await prepareThumbnail(parseThumbnailBrief(raw));
  }
  catch (e) { generating = false; return json({ error: e instanceof Error ? e.message : 'Invalid request.' }, 400); }
  // The answer is written a line at a time: first how the request was understood, then the image (or why not).
  const left = new AbortController();
  const cancel = AbortSignal.any([req.signal, left.signal]);
  const text = new TextEncoder();
  const lines = new ReadableStream<Uint8Array>({
    async start(out) {
      const line = (body: unknown) => { try { out.enqueue(text.encode(JSON.stringify(body) + '\n')); } catch { /* the page has gone */ } };
      try { line(await makeImage(job, cancel, (scene) => line({ scene }))); }
      catch (e) { line({ error: e instanceof Error ? e.message : 'Image generation failed.' }); }
      finally { generating = false; try { out.close(); } catch { /* already closed */ } }
    },
    // Closing the page, or pressing Cancel there, stops Codex too.
    cancel() { left.abort(); },
  });
  return new Response(lines, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
