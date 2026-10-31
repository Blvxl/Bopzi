// Makes one image with the ChatGPT subscription signed into Codex on this computer.
// The session stays on the server and is never sent to browser code; no Platform API key is used.
// Used by the local Bopzi server and by the standalone helper (bopzi-helper.mjs). No dependencies.

import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os, { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { codexModels } from './codex-models.mjs';

const exists = (file) => access(file).then(() => true, () => false);
const WINDOWS = process.platform === 'win32';

/** Runs a program and resolves with what it printed, or null if it could not be started. */
function probe(file, args, includeErrors = false) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try { child = spawn(file, args, { windowsHide: true }); } catch { resolve(null); return; }
    child.stdout?.on('data', (d) => (out += d));
    if (includeErrors) child.stderr?.on('data', (d) => (out += d));
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 5000);
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? out.trim() : null); });
  });
}

let found;
/** Where the Codex program is. The desktop app does not put it on the PATH, so its own folders are searched too. */
export async function findCodex() {
  if (found && (await exists(found))) return found;
  const candidates = [];
  if (process.env.BOPZI_CODEX) candidates.push(process.env.BOPZI_CODEX);
  if (WINDOWS) {
    // The desktop app keeps one folder per installed version; take the newest.
    const bin = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
    const versions = await readdir(bin).catch(() => []);
    const dated = await Promise.all(versions.map(async (v) => {
      const file = path.join(bin, v, 'codex.exe');
      const info = await stat(file).catch(() => null);
      return info ? { file, at: info.mtimeMs } : null;
    }));
    candidates.push(...dated.filter(Boolean).sort((a, b) => b.at - a.at).map((d) => d.file));
    candidates.push(path.join(os.homedir(), '.codex', '.sandbox-bin', 'codex.exe'));
  } else {
    candidates.push('/Applications/Codex.app/Contents/Resources/codex', path.join(os.homedir(), '.codex', 'bin', 'codex'), '/usr/local/bin/codex', '/opt/homebrew/bin/codex');
  }
  for (const file of candidates) {
    if ((await exists(file)) && (await probe(file, ['--version']))) return (found = file);
  }
  // Last: a codex command on the PATH (the CLI installed with npm or brew).
  if (await probe('codex', ['--version'])) return (found = 'codex');
  return null;
}

/** Whether this computer can generate, and if not, what the person has to do. */
export async function codexStatus() {
  const file = await findCodex();
  if (!file) return { connected: false, reason: 'Codex is not installed on this computer.' };
  // Ask Codex to verify the login; an old auth file alone does not establish a usable sign-in.
  const status = await probe(file, ['login', 'status'], true);
  if (!status || !/logged in.*chatgpt/i.test(status)) return { connected: false, reason: 'Codex is installed but not signed in.' };
  return { connected: true, reason: '' };
}

/**
 * Who Codex is signed in as, for showing in Bopzi: a name, an email and the plan, and never a token.
 * These claims are only displayed; nothing is decided from them, so the token's signature is not checked.
 */
export async function codexAccount() {
  try {
    const auth = JSON.parse(await readFile(path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'auth.json'), 'utf8'));
    const claims = JSON.parse(Buffer.from(String(auth?.tokens?.id_token).split('.')[1], 'base64url').toString());
    const plan = claims['https://api.openai.com/auth']?.chatgpt_plan_type;
    if (auth?.auth_mode !== 'chatgpt' || typeof claims.email !== 'string') return null;
    return { name: typeof claims.name === 'string' ? claims.name : '', email: claims.email, plan: typeof plan === 'string' ? plan : '' };
  } catch {
    return null;
  }
}

/** The profile picture set in ChatGPT, kept for an hour per account. Returns null when there is none to show. */
let picture = null;
export async function codexPicture() {
  try {
    const { tokens, auth_mode: mode } = JSON.parse(await readFile(path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'auth.json'), 'utf8'));
    if (mode !== 'chatgpt' || typeof tokens?.access_token !== 'string') return null;
    if (picture?.account === tokens.account_id && Date.now() - picture.at < 3_600_000) return picture.image;
    const headers = { Authorization: `Bearer ${tokens.access_token}`, 'chatgpt-account-id': tokens.account_id, 'user-agent': 'codex_cli_rs/0.1', originator: 'codex_cli_rs' };
    const signal = AbortSignal.timeout(10_000);
    const me = await (await fetch('https://chatgpt.com/backend-api/me', { headers, signal })).json();
    let image = null;
    if (typeof me?.picture === 'string' && me.picture.startsWith('https://')) {
      // The sign-in only goes along to ChatGPT itself; a picture hosted anywhere else is fetched without it.
      const own = new URL(me.picture).hostname === 'chatgpt.com';
      const res = await fetch(me.picture, { headers: own ? headers : {}, signal });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('image/')) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length < 5_000_000) image = { type, bytes };
      }
    }
    picture = { account: tokens.account_id, at: Date.now(), image };
    return image;
  } catch {
    return null;
  }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

function stop(child) {
  if (child.exitCode !== null) return;
  // On Windows Codex starts helpers of its own; end the whole group.
  if (WINDOWS && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
  else child.kill('SIGTERM');
}

/** Writes data-URL images into `dir` as image-1, image-2, ... and returns their paths. */
async function saveImages(dir, urls) {
  const files = [];
  for (const [i, url] of urls.entries()) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!match) throw new Error('One of the images could not be read.');
    const file = path.join(dir, `image-${i + 1}.${EXT[match[1]]}`);
    await writeFile(file, Buffer.from(match[2], 'base64'));
    files.push(file);
  }
  return files;
}

/**
 * Runs Codex once in `dir` with the images attached, and resolves with everything it said, one entry per message.
 * `watch.onMessage` hears each message as it is said. `watch.ready`, asked a few times a second, ends the run
 * early once it answers true: the work is there, and what Codex would still say about it is not waited for.
 */
function run(codex, dir, files, request, sandbox, signal, timeoutMs, slow, watch = {}, extra = []) {
  const args = ['exec', '--json', '--skip-git-repo-check', ...extra, '-s', sandbox, '-C', dir, ...files.flatMap((f) => ['-i', f])];
  return new Promise((resolve, reject) => {
    const child = spawn(codex, args, { cwd: dir, windowsHide: true });
    const startedAt = Date.now();
    let tools = 0;
    const said = [];
    let fault = '';
    let pending = '';
    let done = false;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); clearInterval(poll); signal?.removeEventListener('abort', onAbort); fn(value); };
    const onAbort = () => { stop(child); finish(reject, new Error('Cancelled.')); };
    const timer = setTimeout(() => { stop(child); finish(reject, new Error(slow)); }, timeoutMs);
    const poll = watch.ready ? setInterval(() => { void watch.ready().then((yes) => { if (yes && !done) { stop(child); finish(resolve, said); } }, () => {}); }, 400) : undefined;
    signal?.addEventListener('abort', onAbort);
    // One event per line. Only what Codex says, and why a run failed, is of interest here.
    child.stdout.on('data', (d) => {
      pending += d;
      for (let end = pending.indexOf('\n'); end >= 0; end = pending.indexOf('\n')) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event?.type === 'item.completed' && event.item?.type !== 'agent_message') tools++;
        // One line per run, so a slow edit shows whether the time went to thinking, tools or a big request.
        if (event?.type === 'turn.completed') console.log(`[codex] ${extra.includes('-m') ? extra[extra.indexOf('-m') + 1] : 'default model'}: ${((Date.now() - startedAt) / 1000).toFixed(1)}s, ${event.usage?.input_tokens ?? '?'} tokens in, ${event.usage?.output_tokens ?? '?'} out (${event.usage?.reasoning_output_tokens ?? 0} thinking), ${tools} tool call(s)`);
        if (event?.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
          said.push(event.item.text);
          try { watch.onMessage?.(event.item.text); } catch { /* a listener never stops the run */ }
        } else if (event?.type === 'error' || event?.type === 'turn.failed') {
          const why = event.message ?? event.error?.message;
          if (typeof why === 'string') fault = why;
        }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', (e) => finish(reject, new Error(`Codex could not be started: ${e.message}`)));
    child.on('close', () => finish(resolve, said.length || !fault ? said : [`FAILED: ${fault}`]));
    // The request goes in on standard input, so its length and punctuation never meet the command line.
    child.stdin.on('error', () => {});
    child.stdin.end(request);
  });
}

/**
 * Has Codex look at images and answer a question in words. No image is made and nothing is written.
 * `model` and `effort` are checked against codexModels(); anything else falls back to Codex's default model at low effort.
 * @param {{ question: string, images?: string[], signal?: AbortSignal, timeoutMs?: number, model?: string, effort?: string }} job
 * @returns {Promise<string>} the answer
 */
export async function codexAsk({ question, images = [], signal, timeoutMs = 150_000, model, effort }) {
  const codex = await findCodex();
  if (!codex) throw new Error('The Codex app was not found on this computer.');
  if (signal?.aborted) throw new Error('Cancelled.');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bopzi-'));
  try {
    const files = await saveImages(dir, images);
    const request = [
      'Answer the question below by looking at the attached image' + (files.length > 1 ? 's' : '') + '. Do not generate or edit any image, do not run any commands, do not write any files and do not ask questions.',
      'Your whole reply must be the answer and nothing else.',
      '',
      question,
    ].join('\n');
    // A question needs no tools: skip the person's own Codex setup (its plugins and MCP servers would load, and the
    // agent may wander into them) and keep the thinking short, so an edit plan comes back in seconds.
    // No choice sent: the editor's default, GPT-6-Luna thinking at medium, when this plan offers it.
    const known = (await codexModels()).find((m) => m.id === (model ?? 'gpt-6-luna'));
    const thinking = known?.efforts.includes(effort ?? 'medium') ? (effort ?? 'medium') : 'low';
    const lean = ['--ignore-user-config', '--ignore-rules', '--ephemeral', ...(known ? ['-m', known.id] : []), '-c', `model_reasoning_effort="${thinking}"`];
    const reply = String((await run(codex, dir, files, request, 'read-only', signal, timeoutMs, 'Codex took too long to answer. Try again.', {}, lean)).at(-1) ?? '').trim();
    if (!reply) throw new Error('Codex gave no answer. Try again.');
    return reply.slice(0, 16000);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
  }
}

/**
 * Generates an image through the ChatGPT subscription signed into Codex.
 * @param {{ prompt: string, images?: string[], look?: string[], notes?: string, shape?: 'wide' | 'square', signal?: AbortSignal, timeoutMs?: number, onScene?: (scene: string) => void }} job
 *   `onScene` hears Codex's scene interpretation before the image request starts.
 *   `images` are data URLs, in the order the prompt refers to them (image 1, image 2, ...).
 *   `look` are more images, numbered on from there, that Codex may look at but must not give to the image tool.
 *   `notes` is an optional follow-up question about the generated image; its answer comes back as text.
 * @returns {Promise<{ image: string, notes: string }>} the image as base64 PNG data, and the notes if any were written
 */
export async function codexImage({ prompt, images = [], look = [], notes = '', shape = 'wide', model = 'gpt-image-2.5-sunburst', signal, timeoutMs = 280_000, onScene }) {
  const status = await codexStatus();
  if (!status.connected) throw new Error(status.reason);
  if (signal?.aborted) throw new Error('Cancelled.');
  // Keep the existing Codex-plan sign-in on the server. The CLI status check above refreshes
  // expired credentials before we read the session file; no Platform API key is involved.
  const authPath = path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'auth.json');
  let auth;
  try { auth = JSON.parse(await readFile(authPath, 'utf8')); } catch {
    throw new Error('Could not read the Codex ChatGPT sign-in. Reconnect in Codex and try again.');
  }
  const accessToken = auth?.tokens?.access_token;
  const accountId = auth?.tokens?.account_id;
  if (auth?.auth_mode !== 'chatgpt' || typeof accessToken !== 'string' || typeof accountId !== 'string') {
    throw new Error('A ChatGPT sign-in is required. Reconnect in Codex and try again.');
  }

  // Let Codex interpret scene questions before sending the exact resulting brief to imagegen.
  // Look-only references are available for this reading step but are never sent as image inputs.
  let finalPrompt = prompt;
  const questions = [...prompt.matchAll(/\{\{([\s\S]*?)\}\}/g)];
  if (questions.length) {
    const readableImages = [...images, ...look];
    const answers = [];
    for (const match of questions) {
      const answer = await codexAsk({
        question: `Answer the question between the braces by looking at the attached image${readableImages.length === 1 ? '' : 's'}. Return only the answer text, with no braces or extra commentary.\n\n${match[1]}`,
        images: readableImages,
        signal,
        timeoutMs: Math.min(timeoutMs, 150_000),
      });
      answers.push(answer.replace(/[{}]/g, '').trim());
    }
    let index = 0;
    finalPrompt = prompt.replace(/\{\{[\s\S]*?\}\}/g, () => answers[index++]);
    const scene = answers[0];
    if (scene) onScene?.(scene.slice(0, 600));
  }

  if (signal?.aborted) throw new Error('Cancelled.');
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Timed out')), timeoutMs);
  try {
    const refs = images.map((image_url) => ({ image_url }));
    const endpoint = `https://chatgpt.com/backend-api/codex/images/${refs.length ? 'edits' : 'generations'}`;
    const body = {
      prompt: `${finalPrompt}\n\nOutput aspect ratio: ${shape === 'square' ? '1:1 square' : '16:9 landscape'}.`,
      model,
      n: 1,
      quality: 'high',
      size: shape === 'square' ? '1024x1024' : '1536x864',
      ...(refs.length ? { images: refs } : {}),
    };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'ChatGPT-Account-ID': accountId,
        'OAI-Product-Sku': 'codex',
        'x-codex-image-turn-id': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message ?? payload?.message;
      if (response.status === 401 || response.status === 403) throw new Error('Codex could not use the ChatGPT image generation entitlement. Reconnect in Codex, check your plan access, then try again.');
      throw new Error(typeof detail === 'string' ? `ChatGPT image generation failed: ${detail.slice(0, 300)}` : `ChatGPT image generation failed (HTTP ${response.status}).`);
    }
    const encoded = payload?.data?.[0]?.b64_json;
    if (typeof encoded !== 'string' || !encoded.length) throw new Error('ChatGPT image generation finished without returning an image. Try again.');
    const image = encoded;
    let written = '';
    if (notes) {
      try {
        const answer = await codexAsk({ question: notes, images: [`data:image/png;base64,${encoded}`, ...look], signal, timeoutMs: Math.min(timeoutMs, 150_000) });
        written = answer.slice(0, 4000);
      } catch (error) {
        if (signal?.aborted) throw error;
        // Optional notes never discard a successfully generated image.
      }
    }
    return { image, notes: written };
  } catch (error) {
    if (signal?.aborted) throw new Error('Cancelled.');
    if (controller.signal.aborted) throw new Error('ChatGPT image generation took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
