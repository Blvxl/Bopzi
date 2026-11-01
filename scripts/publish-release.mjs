// Publishes the installers in release/ as an update. Run it only after testing the build:
//   node scripts/publish-release.mjs "What changed in this version"
// It uploads to the public bopzi-licenses repository, then signs and pushes latest.json, which is what apps act on.
import { execFileSync } from 'node:child_process';
import { createHash, sign } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Blvxl/bopzi-licenses';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.join(os.homedir(), '.bopzi');
const clone = path.join(home, 'bopzi-licenses');
const notes = process.argv[2] ?? '';
const { version } = JSON.parse(readFileSync(path.join(root, 'electron', 'package.json'), 'utf8'));

const privateKey = readFileSync(path.join(home, 'license-private.pem'), 'utf8');
const installers = ['x64', 'arm64'].map((arch) => ({ arch, name: `Bopzi-Setup-${version}-win-${arch}.exe` })).map((i) => ({ ...i, file: path.join(root, 'release', i.name) }));
const missing = installers.filter((i) => !existsSync(i.file));
if (missing.length) { console.error(`Missing from release/: ${missing.map((i) => i.name).join(', ')}`); process.exit(1); }

// The GitHub sign-in git already uses on this computer.
const credential = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /^password=(.+)$/m.exec(credential)?.[1];
if (!token) { console.error('No GitHub sign-in was found for git.'); process.exit(1); }
const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'Bopzi' };

const created = await fetch(`https://api.github.com/repos/${REPO}/releases`, { method: 'POST', headers, body: JSON.stringify({ tag_name: `v${version}`, name: `Bopzi ${version}`, body: notes }) });
if (!created.ok) { console.error(`Could not create the release: ${created.status} ${await created.text()}`); process.exit(1); }
const release = await created.json();

const files = {};
for (const { arch, name, file } of installers) {
  const bytes = readFileSync(file);
  console.log(`Uploading ${name}…`);
  const res = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: bytes });
  if (!res.ok) { console.error(`Upload failed for ${name}: ${res.status}. Nothing was announced to apps.`); process.exit(1); }
  files[arch] = { url: `https://github.com/${REPO}/releases/download/v${version}/${name}`, sha512: createHash('sha512').update(bytes).digest('hex'), size: statSync(file).size };
}

// Apps only act on this file, so it goes last, once every installer is in place.
const body = JSON.stringify({ version, notes, files });
const signature = sign(null, Buffer.from(`bopzi-update-v1\n${body}`), privateKey).toString('base64url');
writeFileSync(path.join(clone, 'latest.json'), JSON.stringify({ body, signature }));
const git = (...args) => execFileSync('git', args, { cwd: clone, stdio: 'inherit' });
git('add', 'latest.json');
git('commit', '-m', `Release ${version}`);
git('push');
console.log(`Bopzi ${version} is published. Apps will offer it at their next check.`);
