import { codexModels } from '../../../../../helper/codex-models.mjs';
import { isLocalRequest } from '@/lib/chatgpt/server';
export const runtime = 'nodejs';
/** The models the person's Codex plan offers, for the AI composer's model picker. */
export async function GET(req: Request) {
  if (!isLocalRequest(req) || req.headers.get('x-bopzi-local') !== '1') return Response.json({ error: 'Models are available in your local Bopzi studio.' }, { status: 403 });
  return Response.json({ models: await codexModels() });
}
