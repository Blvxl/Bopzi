const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { CONTEXT, DOWNLOADS, PUBLIC_KEY, isNewer, readManifest } = require('../electron/updater.cjs');

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { pub: publicKey.export({ type: 'spki', format: 'pem' }), priv: privateKey };
};
const owner = pair();
const file = { url: `${DOWNLOADS}v0.2.0/Bopzi-Setup-0.2.0-win-x64.exe`, sha512: 'a'.repeat(128), size: 10 };
const manifest = (release, key = owner.priv) => {
  const body = JSON.stringify(release);
  return JSON.stringify({ body, signature: sign(null, Buffer.from(CONTEXT + body), key).toString('base64url') });
};

test('only a later version counts as an update', () => {
  assert.equal(isNewer('0.2.0', '0.1.9'), true);
  assert.equal(isNewer('0.10.0', '0.9.0'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.0', '0.1.0'), false);
  assert.equal(isNewer('0.1.0', '0.2.0'), false);
});

test('a release signed by the owner is accepted', () => {
  assert.equal(readManifest(manifest({ version: '0.2.0', files: { x64: file } }), owner.pub).version, '0.2.0');
});

test('a release signed by anyone else is refused', () => {
  assert.equal(readManifest(manifest({ version: '0.2.0', files: { x64: file } }, pair().priv), owner.pub), null);
});

test('an edited release is refused', () => {
  const signed = JSON.parse(manifest({ version: '0.2.0', files: { x64: file } }));
  signed.body = signed.body.replace('0.2.0', '9.9.9');
  assert.equal(readManifest(JSON.stringify(signed), owner.pub), null);
});

test('a download from anywhere else is refused, even if signed', () => {
  assert.equal(readManifest(manifest({ version: '0.2.0', files: { x64: { ...file, url: 'https://evil.example/app.exe' } } }), owner.pub), null);
});

test('rubbish is refused, not crashed on', () => {
  for (const value of ['', 'nope', '{}', '{"body":1}']) assert.equal(readManifest(value, owner.pub), null);
});

test('the app trusts the same key the licenses use', () => {
  const source = readFileSync(path.join(__dirname, '..', 'src', 'lib', 'license-public.ts'), 'utf8');
  assert.ok(source.includes(PUBLIC_KEY.trim()));
});
