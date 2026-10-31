import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * ChatGPT plan usage for a copy of Bopzi running on the owner's own machine.
 *
 * Follows OpenAI's flow for open-source and locally hosted apps: the app registers itself during sign-in,
 * the browser returns to a loopback listener on 127.0.0.1, and the tokens stay in a file in the user's home
 * folder. Nothing here runs for a hosted site, and tokens never reach browser code.
 * Text only: OpenAI's preview does not allow image generation on this route.
 * Contract and limits: docs/chatgpt-integration.md.
 */

const ISSUER = 'https://auth.openai.com';
const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const APP_NAME = 'Bopzi';
/** OpenAI requires this exact host and path. The first registration uses this port; later sign-ins may use another. */
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PATH = '/auth/callback';
const CALLBACK_PORT = 1455;
const ATTEMPT_MS = 5 * 60 * 1000;

const DIR = path.join(homedir(), '.bopzi');
const FILE = path.join(DIR, 'chatgpt-auth.json');

type Tokens = { access_token: string; refresh_token?: string; id_token?: string; expires_at: number; scopes: string[] };
type Store = {
  hostId: string;
  clientId?: string;
  account?: { sub: string; email?: string; name?: string };
  tokens?: Tokens;
  savedAt?: string;
};
type Attempt = { server: Server; state: string; nonce: string; verifier: string; redirectUri: string; clientId: string; timer: ReturnType<typeof setTimeout> };
type Runtime = { attempt?: Attempt; lastError?: string; models?: { at: number; list: Model[] }; refreshing?: Promise<string> };
export type Model = { slug: string; name: string };

// Survives hot reloads in development, so a sign-in in progress is not lost when a file changes.
const g = globalThis as typeof globalThis & { __bopziChatGPT?: Runtime };
const rt: Runtime = (g.__bopziChatGPT ??= {});

export class ChatGptError extends Error {
  constructor(
    message: string,
    public code = 'error',
    public status = 400,
  ) {
    super(message);
  }
}

// ---------- availability: the owner's machine only ----------

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True only when the request reached this server on a loopback address, and never on a production build unless opted in. */
export function isLocalRequest(req: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.BOPZI_LOCAL_CHATGPT !== '1') return false;
  const bare = (h: string | null) => (h ?? '').split(',')[0].trim().replace(/:\d+$/, '');
  if (!LOOPBACK.has(bare(req.headers.get('host')))) return false;
  // Behind a proxy the public name shows up here, even if Host was rewritten.
  const forwarded = req.headers.get('x-forwarded-host');
  return !forwarded || LOOPBACK.has(bare(forwarded));
}

/** Other websites must not be able to trigger sign-in or spend plan usage through the visitor's browser. */
export function isSameOriginCall(req: Request) {
  if (req.headers.get('x-bopzi-local') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    return source.protocol === target.protocol && source.host === (req.headers.get('host') ?? target.host);
  } catch {
    return false;
  }
}

// ---------- storage ----------

function load(): Store {
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8')) as Store;
    if (data.hostId) return data;
  } catch {
    // first run, or an unreadable file: start again with a new host ID
  }
  const fresh: Store = { hostId: `urn:uuid:${randomUUID()}` };
  save(fresh);
  return fresh;
}

function save(store: Store) {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...store, savedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

// ---------- small helpers ----------

const b64url = (buf: Buffer) => buf.toString('base64url');
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

async function verifyIdToken(idToken: string, clientId: string, nonce?: string) {
  const [h, p, s] = idToken.split('.');
  if (!h || !p || !s) throw new ChatGptError('The sign-in response was not a valid ID token.', 'invalid_id_token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { alg?: string; kid?: string };
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string; email?: string; name?: string };
  if (header.alg !== 'RS256') throw new ChatGptError('Unexpected ID token algorithm.', 'invalid_id_token');
  const res = await fetch(JWKS);
  if (!res.ok) throw new ChatGptError('Could not load OpenAI signing keys.', 'jwks_unavailable', 502);
  const { keys } = (await res.json()) as { keys: ({ kid?: string } & Record<string, unknown>)[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new ChatGptError('The ID token was signed with an unknown key.', 'invalid_id_token');
  const key = createPublicKey({ key: jwk as never, format: 'jwk' });
  if (!verifySignature('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw new ChatGptError('The ID token signature did not verify.', 'invalid_id_token');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !aud.includes(clientId)) throw new ChatGptError('The ID token was issued for a different app.', 'invalid_id_token');
  if (!claims.exp || claims.exp * 1000 < Date.now() - 60_000) throw new ChatGptError('The ID token has expired.', 'invalid_id_token');
  if (nonce !== undefined && claims.nonce !== nonce) throw new ChatGptError('The ID token did not match this sign-in attempt.', 'invalid_id_token');
  if (!claims.sub) throw new ChatGptError('The ID token had no account identity.', 'invalid_id_token');
  return { sub: claims.sub, email: claims.email, name: claims.name };
}

type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

function toTokens(body: TokenResponse, previous?: Tokens): Tokens {
  if (!body.access_token) throw new ChatGptError('OpenAI did not return an access token.', 'token_error', 502);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previous?.refresh_token,
    id_token: body.id_token ?? previous?.id_token,
    expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
    scopes: body.scope ? body.scope.split(' ').filter(Boolean) : (previous?.scopes ?? []),
  };
}

// ---------- sign-in ----------

function endAttempt() {
  const a = rt.attempt;
  if (!a) return;
  clearTimeout(a.timer);
  a.server.close();
  rt.attempt = undefined;
}

function listen(server: Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, CALLBACK_HOST, () => {
      server.off('error', reject);
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title} · Bopzi</title><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#100e0c;color:#f3ede2;font:16px/1.6 system-ui,sans-serif">` +
  `<div style="max-width:420px;padding:24px"><h1 style="font-size:1.5rem;margin:0 0 8px">${title}</h1><p style="margin:0;color:#aaa194">${body}</p></div>`;

/** Starts the loopback listener and returns the URL the owner opens to sign in. */
export async function startConnect() {
  endAttempt();
  rt.lastError = undefined;
  const store = load();
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const clientId = store.clientId ?? 'dynamic_agent_client';

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${CALLBACK_HOST}`);
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    finishConnect(url.searchParams)
      .then(() => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page('ChatGPT is connected', 'You can close this tab and go back to Bopzi.')))
      .catch((err: unknown) => {
        rt.lastError = err instanceof Error ? err.message : 'Sign-in failed.';
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(page('Sign-in did not finish', `${rt.lastError} Go back to Bopzi and try again.`));
      })
      .finally(endAttempt);
  });

  let port: number;
  try {
    port = await listen(server, CALLBACK_PORT);
  } catch {
    // Only the first registration is tied to the documented port. A returning account may use any free one.
    if (!store.clientId) throw new ChatGptError(`Port ${CALLBACK_PORT} on this computer is in use by another app (often another AI tool's sign-in). Close it and try again.`, 'port_in_use', 409);
    port = await listen(server, 0);
  }
  const redirectUri = `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`;
  const timer = setTimeout(() => {
    rt.lastError = 'The sign-in window timed out.';
    endAttempt();
  }, ATTEMPT_MS);
  rt.attempt = { server, state, nonce, verifier, redirectUri, clientId, timer };

  const q = new URLSearchParams({ client_id: clientId, ext_agent_host_id: store.hostId, response_type: 'code', redirect_uri: redirectUri, scope: SCOPE, resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: b64url(createHash('sha256').update(verifier).digest()) });
  if (!store.clientId) q.set('agent_name_hint', APP_NAME);
  else {
    if (store.tokens?.id_token) q.set('id_token_hint', store.tokens.id_token);
    if (store.account?.email) q.set('login_hint', store.account.email);
  }
  return `${AUTHORIZE}?${q}`;
}

async function finishConnect(params: URLSearchParams) {
  const a = rt.attempt;
  if (!a) throw new ChatGptError('No sign-in is in progress.', 'no_attempt');
  if (params.get('state') !== a.state) throw new ChatGptError('The sign-in response did not match this attempt.', 'state_mismatch');
  if (params.get('error')) throw new ChatGptError(params.get('error') === 'access_denied' ? 'Access was declined in ChatGPT.' : `OpenAI returned "${params.get('error')}".`, 'denied');
  const code = params.get('code');
  if (!code) throw new ChatGptError('OpenAI did not return a sign-in code.', 'no_code');

  const store = load();
  const returned = params.get('client_id');
  let clientId = a.clientId;
  if (a.clientId === 'dynamic_agent_client') {
    if (!returned) throw new ChatGptError('OpenAI did not finish registering Bopzi. Try connecting again.', 'registration_incomplete');
    clientId = returned;
  } else if (returned && returned !== a.clientId) {
    throw new ChatGptError('The sign-in response was for a different app registration.', 'client_mismatch');
  }

  const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: a.verifier, redirect_uri: a.redirectUri, resource: RESOURCE }) });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) throw new ChatGptError(`OpenAI rejected the sign-in code (${body.error ?? res.status}).`, body.error ?? 'token_error');
  const tokens = toTokens(body);
  if (!tokens.id_token) throw new ChatGptError('OpenAI did not return an ID token.', 'invalid_id_token');
  const account = await verifyIdToken(tokens.id_token, clientId, a.nonce);
  if (store.clientId === clientId && store.account && store.account.sub !== account.sub) throw new ChatGptError('That is a different ChatGPT account from the one connected before. Disconnect first to switch accounts.', 'account_mismatch');

  save({ ...store, clientId, account, tokens });
  rt.models = undefined;
}

// ---------- tokens ----------

const REFRESH_DEAD = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);

async function refresh(store: Store): Promise<string> {
  const { tokens, clientId } = store;
  if (!tokens?.refresh_token || !clientId) throw new ChatGptError('Sign in to ChatGPT again.', 'signed_out', 401);
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token, resource: RESOURCE }) });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    if (body.error && REFRESH_DEAD.has(body.error)) {
      // The grant is gone for good. Keep the registration and host ID so the next sign-in reuses them.
      save({ ...load(), tokens: undefined });
      throw new ChatGptError('Your ChatGPT sign-in has expired. Connect again.', 'signed_out', 401);
    }
    throw new ChatGptError('Could not renew the ChatGPT sign-in right now. Try again in a moment.', 'refresh_failed', 503);
  }
  const next = toTokens(body, tokens);
  save({ ...load(), tokens: next });
  return next.access_token;
}

async function accessToken() {
  const store = load();
  if (!store.tokens) throw new ChatGptError('ChatGPT is not connected.', 'signed_out', 401);
  if (!store.tokens.scopes.includes(PLAN_SCOPE)) throw new ChatGptError('Plan usage was not granted for Bopzi. Connect again and allow it.', 'no_plan_usage', 403);
  if (store.tokens.expires_at - 90_000 > Date.now()) return store.tokens.access_token;
  // One refresh at a time: refresh tokens rotate, so two parallel refreshes would invalidate each other.
  rt.refreshing ??= refresh(store).finally(() => (rt.refreshing = undefined));
  return rt.refreshing;
}

export async function disconnect() {
  endAttempt();
  const store = load();
  let revoked = false;
  if (store.tokens?.refresh_token && store.clientId) {
    try {
      const res = await fetch(REVOKE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: store.tokens.refresh_token, token_type_hint: 'refresh_token', client_id: store.clientId }) });
      revoked = res.ok;
    } catch {
      revoked = false;
    }
  }
  // Tokens always go; the registration and host ID stay for a later sign-in.
  save({ ...store, tokens: undefined });
  rt.models = undefined;
  return { revoked };
}

// ---------- status, models, inference ----------

export function status() {
  const store = load();
  const connected = !!store.tokens;
  return {
    connected,
    connecting: !!rt.attempt,
    planUsage: connected && store.tokens!.scopes.includes(PLAN_SCOPE),
    account: connected ? (store.account?.email ?? store.account?.name ?? 'ChatGPT account') : null,
    error: rt.lastError ?? null,
  };
}

const FRIENDLY: Record<string, string> = {
  subscription_sharing_usage_limit_exceeded: 'The usage limit for Bopzi on your ChatGPT plan has been reached. Check ChatGPT → Settings → Usage.',
  subscription_sharing_user_not_eligible: 'This ChatGPT account or workspace is not eligible for plan usage in apps.',
  subscription_sharing_usage_unavailable: 'ChatGPT could not check your usage right now. Try again in a moment.',
  subscription_sharing_user_unavailable: 'ChatGPT account information is temporarily unavailable. Try again in a moment.',
  subscription_sharing_unsupported_capability: 'ChatGPT plan usage does not support that request.',
  subscription_sharing_invalid_user: 'ChatGPT no longer accepts this connection. Disconnect and connect again.',
  chatpass_v2_scope_not_authorized: 'This connection is not allowed to make that request.',
  chatpass_v2_invalid_authorization_context: 'This connection is not allowed to make that request.',
};

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; detail?: string };
  const code = body.error?.code ?? `http_${res.status}`;
  const fallback = res.status === 401 ? 'ChatGPT did not accept this connection. Disconnect and connect again.' : res.status === 403 ? 'ChatGPT refused the request for this account.' : res.status === 503 ? 'ChatGPT plan usage is unavailable right now. Try again in a moment.' : (body.error?.message ?? body.detail ?? `ChatGPT returned an error (${res.status}).`);
  throw new ChatGptError(FRIENDLY[code] ?? fallback, code, res.status);
}

export async function listModels(): Promise<Model[]> {
  if (rt.models && Date.now() - rt.models.at < 5 * 60 * 1000) return rt.models.list;
  const res = await fetch(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) await fail(res);
  const body = (await res.json()) as { models?: { slug: string; display_name?: string; visibility?: string }[] };
  const list = (body.models ?? []).filter((m) => m.visibility === 'list').map((m) => ({ slug: m.slug, name: m.display_name ?? m.slug }));
  rt.models = { at: Date.now(), list };
  return list;
}

/** One streamed text response, collected. `store: false` and `stream: true` are required on this route. */
export async function respond(model: string, prompt: string) {
  const res = await fetch(`${RESOURCE}/responses`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: prompt }], store: false, stream: true }),
  });
  if (!res.ok || !res.body) await fail(res);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let event: { type?: string; delta?: string; response?: { error?: { code?: string; message?: string } } };
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.type === 'response.output_text.delta' && event.delta) text += event.delta;
      else if (event.type === 'response.completed') completed = true;
      else if (event.type === 'response.failed' || event.type === 'response.incomplete') {
        const code = event.response?.error?.code ?? event.type;
        throw new ChatGptError(FRIENDLY[code] ?? event.response?.error?.message ?? 'ChatGPT could not finish the response.', code, 502);
      }
    }
  }
  if (!completed) throw new ChatGptError('The response from ChatGPT was cut off. Try again.', 'incomplete', 502);
  return text.trim();
}
