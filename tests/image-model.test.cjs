const test = require('node:test');
const assert = require('node:assert');

const core = () => import('../helper/codex-core.mjs');

test('a refused model moves on to the next one, other failures do not', async () => {
  const { modelRefused } = await core();
  assert.equal(modelRefused(400, "The model 'x' does not exist"), true);
  assert.equal(modelRefused(404, 'model not found'), true);
  assert.equal(modelRefused(403, 'Your plan cannot use this model'), true);
  assert.equal(modelRefused(403, 'Forbidden'), false);
  assert.equal(modelRefused(400, 'Rejected by the safety system for this model'), false);
  assert.equal(modelRefused(400, 'prompt too long'), false);
  assert.equal(modelRefused(429, 'model is busy'), false);
  assert.equal(modelRefused(500, 'model crashed'), false);
});

test('failures read as plain advice', async () => {
  const { imageFailure } = await core();
  assert.match(imageFailure(429), /image limit/);
  assert.match(imageFailure(403), /Reconnect/);
  assert.match(imageFailure(400, 'unknown model'), /Update Bopzi/);
  assert.match(imageFailure(404), /Update Bopzi/);
  assert.match(imageFailure(503), /few minutes/);
  assert.match(imageFailure(400, 'prompt too long'), /prompt too long/);
});
