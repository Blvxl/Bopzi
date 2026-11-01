const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../src/studio/friendly.ts');

test('network failures read as plain advice', async () => {
  const { plain } = await load();
  for (const raw of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) assert.match(plain(raw), /could not reach the server/);
});
test('rate limits, broken answers and server errors are explained', async () => {
  const { plain } = await load();
  assert.match(plain('Roblox could not be reached (error 429). Try again in a moment.'), /Too many tries/);
  assert.match(plain("Unexpected token '<', \"<html>\" is not valid JSON"), /our side/);
  assert.match(plain('502 Bad Gateway'), /server had a problem/);
});
test('messages that already read well are left alone', async () => {
  const { plain } = await load();
  assert.equal(plain('No Roblox user called "abc" was found.'), 'No Roblox user called "abc" was found.');
});
