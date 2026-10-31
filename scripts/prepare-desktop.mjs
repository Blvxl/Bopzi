import { execFileSync } from 'node:child_process';
import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'build', 'desktop');
const bin = path.join(output, 'bin');
await mkdir(bin, { recursive: true });

const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const svg = await readFile(path.join(root, 'src', 'app', 'icon.svg'));
const iconPng = path.join(output, 'icon.png');
await sharp(svg).resize(512, 512).png().toFile(iconPng);
await writeFile(path.join(output, 'icon.ico'), await pngToIco(iconPng));

function findExecutable(name, override) {
  const candidates = [override].filter(Boolean);
  try {
    candidates.push(...execFileSync('where.exe', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter(Boolean));
  } catch { /* FFmpeg is optional at build time; Bopzi can use PATH at runtime. */ }
  return candidates.find(candidate => candidate && path.isAbsolute(candidate));
}

const arch = process.argv.includes('--x64') ? 'x64' : process.argv.includes('--arm64') ? 'arm64' : process.arch;
const codexVersion = execFileSync('npm', ['view', '@openai/codex', 'version'], { encoding: 'utf8', shell: true }).trim();
const unpack = await mkdtemp(path.join(os.tmpdir(), 'bopzi-codex-'));
execFileSync('npm', ['pack', `@openai/codex@${codexVersion}-win32-${arch}`, '--silent'], { cwd: unpack, stdio: 'ignore', shell: true });
execFileSync('tar', ['-xzf', (await readdir(unpack)).find((f) => f.endsWith('.tgz'))], { cwd: unpack, stdio: 'ignore' });
const codex = (await readdir(unpack, { recursive: true })).find((f) => path.basename(f) === 'codex.exe');
if (!codex) throw new Error('The Codex package did not contain codex.exe.');
await rm(path.join(bin, 'codex.exe'), { force: true });
await writeFile(path.join(bin, 'codex.exe'), await readFile(path.join(unpack, codex)));
await rm(unpack, { recursive: true, force: true });

// The server is built on this machine, so a build for the other chip needs that chip's image library.
const standalone = path.join(root, '.next', 'standalone', 'node_modules', '@img');
const sharpVersion = JSON.parse(await readFile(path.join(root, 'node_modules', 'sharp', 'package.json'), 'utf8')).version;
if (arch !== process.arch) {
  const lib = await mkdtemp(path.join(os.tmpdir(), 'bopzi-sharp-'));
  execFileSync('npm', ['pack', `@img/sharp-win32-${arch}@${sharpVersion}`, '--silent'], { cwd: lib, stdio: 'ignore', shell: true });
  execFileSync('tar', ['-xzf', (await readdir(lib)).find((f) => f.endsWith('.tgz'))], { cwd: lib, stdio: 'ignore' });
  await rm(path.join(standalone, `sharp-win32-${process.arch}`), { recursive: true, force: true });
  await cp(path.join(lib, 'package'), path.join(standalone, `sharp-win32-${arch}`), { recursive: true });
  await rm(lib, { recursive: true, force: true });
}
console.log(`Bundled Codex ${codexVersion} for ${arch}.`);

// Video is hidden, so FFmpeg stays out of the installer unless a build asks for it.
await rm(path.join(bin, 'ffmpeg.exe'), { force: true });
await rm(path.join(bin, 'ffprobe.exe'), { force: true });
if (process.argv.includes('--with-ffmpeg')) {
  const ffmpeg = findExecutable('ffmpeg.exe', process.env.BOPZI_FFMPEG);
  const ffprobe = findExecutable('ffprobe.exe', process.env.BOPZI_FFPROBE);
  if (!ffmpeg || !ffprobe) throw new Error('FFmpeg was not found.');
  await copyFile(ffmpeg, path.join(bin, 'ffmpeg.exe'));
  await copyFile(ffprobe, path.join(bin, 'ffprobe.exe'));
}
