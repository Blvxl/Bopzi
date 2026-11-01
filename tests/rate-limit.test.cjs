const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/lib/rate-limit.ts');

test('allows up to the limit, then refuses', async () => {
  const { tooMany } = await load();
  for (let i = 0; i < 3; i++) assert.equal(tooMany('a', 3, 1000), false);
  assert.equal(tooMany('a', 3, 1000), true);
});
test('callers are counted separately', async () => {
  const { tooMany } = await load();
  for (let i = 0; i < 4; i++) tooMany('b', 3, 1000);
  assert.equal(tooMany('c', 3, 1000), false);
});
test('old requests stop counting', async () => {
  const { tooMany } = await load();
  for (let i = 0; i < 4; i++) tooMany('d', 3, 30);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(tooMany('d', 3, 30), false);
});
test('the caller is the first forwarded address', async () => {
  const { callerOf } = await load();
  assert.equal(callerOf(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })), '1.2.3.4');
  assert.equal(callerOf(new Request('http://x')), 'unknown');
});
