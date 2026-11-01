// Publishes site/ to GitHub Pages from the public bopzi-licenses repository.
import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Blvxl/bopzi-licenses';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = path.join(os.homedir(), '.bopzi', 'bopzi-licenses');
const git = (...args) => execFileSync('git', args, { cwd: clone, encoding: 'utf8' });

cpSync(path.join(root, 'site'), clone, { recursive: true });
git('add', 'index.html', 'img');
if (git('status', '--porcelain').trim()) {
  git('commit', '-m', 'Update the Bopzi site');
  git('push');
}

const credential = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /^password=(.+)$/m.exec(credential)?.[1];
if (!token) throw new Error('No GitHub sign-in was found for git.');
const res = await fetch(`https://api.github.com/repos/${REPO}/pages`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'Bopzi' },
  body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
});
// 409 means Pages is already on.
if (!res.ok && res.status !== 409) throw new Error(`Could not turn on GitHub Pages: ${res.status} ${await res.text()}`);
console.log('Site published: https://blvxl.github.io/bopzi-licenses/');
