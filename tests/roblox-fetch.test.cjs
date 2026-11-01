const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const load = () => import('../src/lib/thumbnail/roblox-fetch.ts');
const serve = (statuses) => new Promise((resolve) => {
  let calls = 0;
  const server = http.createServer((req, res) => { const status = statuses[Math.min(calls++, statuses.length - 1)]; res.writeHead(status); res.end('{}'); });
  server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/`, calls: () => calls }));
});

test('a "too many requests" answer is retried until it works', async () => {
  const { robloxFetch } = await load();
  const s = await serve([429, 429, 200]);
  try {
    const res = await robloxFetch(s.url, { signal: AbortSignal.timeout(8000) });
    assert.equal(res.status, 200);
    assert.equal(s.calls(), 3);
  } finally { s.server.close(); }
});

test('a missing page is answered at once, not retried', async () => {
  const { robloxFetch } = await load();
  const s = await serve([404]);
  try {
    assert.equal((await robloxFetch(s.url)).status, 404);
    assert.equal(s.calls(), 1);
  } finally { s.server.close(); }
});

test('after the last try the real answer is returned', async () => {
  const { robloxFetch } = await load();
  const s = await serve([503]);
  try {
    assert.equal((await robloxFetch(s.url, { signal: AbortSignal.timeout(8000) })).status, 503);
    assert.equal(s.calls(), 3);
  } finally { s.server.close(); }
});
