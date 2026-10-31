const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const test = require('node:test');

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ type: 'spki', format: 'pem' }), priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
};
const owner = pair();
const stranger = pair();
const DEVICE = 'AAAA-BBBB-CCCC-DDDD';
let core;
test.before(async () => { core = await import('../helper/license-core.mjs'); });

test('a key made by the owner reads back on its own computer', () => {
  const { key } = core.makeKey({ username: 'Alex', device: DEVICE }, owner.priv);
  const license = core.readKey(key, owner.pub);
  assert.equal(license.username, 'alex');
  assert.ok(core.keyFitsDevice(license, DEVICE));
});

test('a key is refused on another computer', () => {
  const { key } = core.makeKey({ username: 'alex', device: DEVICE }, owner.priv);
  assert.equal(core.keyFitsDevice(core.readKey(key, owner.pub), '1111-2222-3333-4444'), false);
});

test('a key signed by anyone else is refused', () => {
  const { key } = core.makeKey({ username: 'alex', device: DEVICE }, stranger.priv);
  assert.equal(core.readKey(key, owner.pub), null);
});

test('editing a key breaks it', () => {
  const { key } = core.makeKey({ username: 'alex', device: DEVICE }, owner.priv);
  const [payload, signature] = key.slice('BOPZI-'.length).split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), u: 'mallory', d: '1111222233334444' })).toString('base64url');
  assert.equal(core.readKey(`BOPZI-${forged}.${signature}`, owner.pub), null);
});

test('rubbish is refused, not crashed on', () => {
  for (const value of ['', 'BOPZI-', 'BOPZI-a.b', 'hello', null, 7]) assert.equal(core.readKey(value, owner.pub), null);
});

test('the disabled list only counts when the owner signed it', () => {
  const { id } = core.makeKey({ username: 'alex', device: DEVICE }, owner.priv);
  assert.deepEqual(core.readList(core.signList([id], owner.priv), owner.pub).disabled, [id]);
  assert.equal(core.readList(core.signList([], stranger.priv), owner.pub), null);
});

test('an edited list is refused', () => {
  const list = JSON.parse(core.signList(['abc'], owner.priv));
  list.body = list.body.replace('abc', '');
  assert.equal(core.readList(JSON.stringify(list), owner.pub), null);
});

test('an older list cannot replace a newer one', () => {
  const old = core.signList([], owner.priv, 1000);
  assert.equal(core.readList(old, owner.pub, 2000), null);
  assert.ok(core.readList(old, owner.pub, 1000));
});

test('a bad device code or username is refused when making a key', () => {
  assert.throws(() => core.makeKey({ username: 'alex', device: 'nope' }, owner.priv));
  assert.throws(() => core.makeKey({ username: '!', device: DEVICE }, owner.priv));
});

test('the owner check matches only the real private key', () => {
  assert.equal(core.publicKeyOf(owner.priv).trim(), owner.pub.toString().trim());
  assert.notEqual(core.publicKeyOf(stranger.priv).trim(), owner.pub.toString().trim());
});
