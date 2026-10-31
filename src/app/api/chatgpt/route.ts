import { ChatGptError, disconnect, isLocalRequest, isSameOriginCall, listModels, respond, startConnect, status } from '@/lib/chatgpt/server';

// Local, personal-use ChatGPT plan connection. Every handler refuses unless the request arrived on a loopback address.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { 'cache-control': 'no-store' } });
const unavailable = () => json({ available: false });

function problem(err: unknown) {
  if (err instanceof ChatGptError) return json({ error: err.message, code: err.code }, { status: err.status });
  return json({ error: 'Something went wrong talking to ChatGPT.', code: 'error' }, { status: 500 });
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) return unavailable();
  const s = status();
  let models: Awaited<ReturnType<typeof listModels>> = [];
  let error = s.error;
  if (s.connected && s.planUsage) {
    try {
      models = await listModels();
    } catch (err) {
      error = err instanceof ChatGptError ? err.message : 'Could not load your ChatGPT models.';
    }
  }
  // Read status again: a failed refresh inside listModels signs the connection out.
  return json({ available: true, ...status(), models, error });
}

const IMPROVE = `You improve prompts for an image generator. The prompt below asks for a background image for a Roblox game thumbnail.
Rewrite it so it is more vivid, specific and well composed, while keeping every constraint it states: the 16:9 landscape format, the space left for a character and for a title, and every rule in its "Rules" list (no characters, no text, no logos, edge to edge).
Do not add characters, people, creatures or any lettering. Do not ask questions. Reply with the rewritten prompt only, as plain text, no preamble and no code fences.

PROMPT:
`;

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return unavailable();
  if (!isSameOriginCall(req)) return json({ error: 'Blocked.', code: 'forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; model?: string; prompt?: string };
  try {
    if (body.action === 'connect') return json({ url: await startConnect() });
    if (body.action === 'disconnect') return json(await disconnect());
    if (body.action === 'improve') {
      const prompt = String(body.prompt ?? '').slice(0, 6000);
      const model = String(body.model ?? '');
      if (!prompt.trim() || !model) return json({ error: 'Nothing to improve yet.', code: 'empty' }, { status: 400 });
      return json({ text: await respond(model, IMPROVE + prompt) });
    }
    return json({ error: 'Unknown action.', code: 'bad_request' }, { status: 400 });
  } catch (err) {
    return problem(err);
  }
}
