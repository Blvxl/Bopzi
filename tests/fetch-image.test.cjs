const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const load = () => import('../src/lib/thumbnail/fetch-image.ts');

function serve() {
  const server = http.createServer((req, res) => {
    if (req.url === '/moved') { res.writeHead(302, { location: '/image' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end('ok');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('an image is fetched', async () => {
  const { fetchImage } = await load();
  const server = await serve();
  try {
    const res = await fetchImage(`http://127.0.0.1:${server.address().port}/image`, AbortSignal.timeout(3000));
    assert.equal(res.status, 200);
  } finally { server.close(); }
});

test('a redirect is refused, not followed', async () => {
  const { fetchImage } = await load();
  const server = await serve();
  try {
    await assert.rejects(fetchImage(`http://127.0.0.1:${server.address().port}/moved`, AbortSignal.timeout(3000)), /not followed/);
  } finally { server.close(); }
});
