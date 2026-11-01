#!/usr/bin/env node
// Bopzi helper. Lets the Bopzi website make images with the ChatGPT plan that the Codex app on THIS computer
// is signed in with. It listens only on this computer, and only answers the Bopzi site(s) named below.
//
//   node bopzi-helper.mjs                          answers http://localhost:3000
//   node bopzi-helper.mjs --origin https://bopzi.example
//
// It never reads your sign-in and never sends anything anywhere except to Codex on this machine.

import http from 'node:http';
import { codexAsk, codexImage, codexStatus } from './codex-core.mjs';
import { robloxAvatar, robloxImage } from './roblox.mjs';

const PORT = Number(process.env.BOPZI_HELPER_PORT ?? 47615);
const origins = new Set(['http://localhost:3000']);
for (let i = 2; i < process.argv.length; i++) if (process.argv[i] === '--origin' && process.argv[i + 1]) origins.add(process.argv[++i].replace(/\/+$/, ''));

const MAX_BODY = 40 * 1024 * 1024;
let busy = false;

function reply(res, origin, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    // Only a named Bopzi site may read the answer; `vary` keeps caches from mixing sites up.
    ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  // A page on any other site gets nothing, so no other website can spend this person's plan.
  if (!origin || !origins.has(origin)) { reply(res, null, 403, { error: 'This helper only answers Bopzi.' }); return; }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'content-type',
      // Browsers ask for this before a public site may talk to a program on the same computer.
      'access-control-allow-private-network': 'true',
      'access-control-max-age': '600',
      vary: 'Origin',
    });
    res.end();
    return;
  }

  const route = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'GET' && route === '/status') { reply(res, origin, 200, { helper: 1, ...(await codexStatus()) }); return; }

  if (req.method === 'POST' && route === '/generate') {
    if (busy) { reply(res, origin, 409, { error: 'An image is already being generated. Wait for it to finish.' }); return; }
    let raw = '';
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) { reply(res, origin, 413, { error: 'The images are too large.' }); return; }
      raw += chunk;
    }
    let job;
    try { job = JSON.parse(raw); } catch { reply(res, origin, 400, { error: 'Invalid request.' }); return; }
    const images = Array.isArray(job.images) ? job.images : [];
    const look = Array.isArray(job.look) ? job.look : [];
    if (typeof job.prompt !== 'string' || job.prompt.length < 20 || job.prompt.length > 20000 || images.length > 6 || look.length > 2 || ![...images, ...look].every((i) => typeof i === 'string')) { reply(res, origin, 400, { error: 'Invalid request.' }); return; }
    // Closing the page, or pressing Cancel there, stops Codex too.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    busy = true;
    // The answer is written a line at a time: first how the request was understood, then the image (or why not).
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'access-control-allow-origin': origin, vary: 'Origin' });
    const line = (body) => { if (!res.writableEnded && !abort.signal.aborted) res.write(JSON.stringify(body) + '\n'); };
    try {
      line(await codexImage({ prompt: job.prompt, images, look, notes: typeof job.notes === 'string' ? job.notes.slice(0, 3000) : '', shape: job.shape === 'square' ? 'square' : 'wide', signal: abort.signal, onScene: (scene) => line({ scene }) }));
    } catch (e) {
      line({ error: e instanceof Error ? e.message : 'The image could not be made.' });
    } finally { busy = false; res.end(); }
    return;
  }
  // Roblox lookups from this computer: web hosts share addresses that Roblox limits, a home connection does not.
  if (req.method === 'POST' && (route === '/roblox/avatar' || route === '/roblox/image')) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) { reply(res, origin, 413, { error: 'The request is too large.' }); return; } }
    let job;
    try { job = JSON.parse(raw); } catch { reply(res, origin, 400, { error: 'Invalid request.' }); return; }
    try { reply(res, origin, 200, route === '/roblox/avatar' ? await robloxAvatar(job) : await robloxImage(job?.url)); }
    catch (e) { reply(res, origin, 400, { error: e instanceof Error ? e.message : 'Roblox could not be reached.' }); }
    return;
  }
  // A question about a picture, answered in words. No image is made.
  if (req.method === 'POST' && route === '/ask') {
    let raw = '';
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) { reply(res, origin, 413, { error: 'The image is too large.' }); return; }
      raw += chunk;
    }
    let job;
    try { job = JSON.parse(raw); } catch { reply(res, origin, 400, { error: 'Invalid request.' }); return; }
    const images = Array.isArray(job.images) ? job.images : [];
    if (typeof job.question !== 'string' || job.question.length < 20 || job.question.length > 8000 || images.length > 2 || !images.every((i) => typeof i === 'string')) { reply(res, origin, 400, { error: 'Invalid request.' }); return; }
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try { reply(res, origin, 200, { answer: await codexAsk({ question: job.question, images, signal: abort.signal }) }); }
    catch (e) { if (!abort.signal.aborted) reply(res, origin, 502, { error: e instanceof Error ? e.message : 'The image could not be looked at.' }); }
    return;
  }
  reply(res, origin, 404, { error: 'Not found.' });
});

server.listen(PORT, '127.0.0.1', async () => {
  const status = await codexStatus();
  console.log(`Bopzi helper is running on this computer (port ${PORT}).`);
  console.log(`It answers: ${[...origins].join(', ')}`);
  console.log(status.connected ? 'Codex is installed and signed in. You can generate in Bopzi now.' : `Not ready yet: ${status.reason}`);
  console.log('Leave this window open while you use Bopzi. Close it to stop.');
});
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Is the helper already running?` : e.message); process.exit(1); });
