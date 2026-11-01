const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const bundle = async (origin) => (await import('../helper/bundle-helper.mjs')).bundleHelper(path.join(__dirname, '../helper'), origin);

test('the downloaded helper is one file with no imports of its own files', async () => {
  const file = await bundle('https://bopzi.dev');
  assert.doesNotMatch(file, /from '\.\//, 'it still imports a neighbouring file');
  assert.match(file, /new Set\(\["https:\/\/bopzi\.dev"\]\)/);
});

test('the downloaded helper starts alone and only answers its own site', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bopzi-helper-'));
  const file = path.join(dir, 'bopzi-helper.mjs');
  await writeFile(file, await bundle('https://bopzi.test'));
  const port = 47990 + Math.floor(Math.random() * 9);
  const child = spawn(process.execPath, [file], { env: { ...process.env, BOPZI_HELPER_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  try {
    for (let i = 0; i < 50 && !/is running/.test(output) && child.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(output, /is running/, `the helper did not start:\n${output}`);
    const ok = await fetch(`http://127.0.0.1:${port}/status`, { headers: { origin: 'https://bopzi.test' } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).helper, 1);
    const other = await fetch(`http://127.0.0.1:${port}/status`, { headers: { origin: 'https://evil.example' } });
    assert.equal(other.status, 403);
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
