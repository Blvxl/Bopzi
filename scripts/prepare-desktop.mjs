import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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

const ffmpeg = findExecutable('ffmpeg.exe', process.env.BOPZI_FFMPEG);
const ffprobe = findExecutable('ffprobe.exe', process.env.BOPZI_FFPROBE);
if (ffmpeg && ffprobe) {
  await copyFile(ffmpeg, path.join(bin, 'ffmpeg.exe'));
  await copyFile(ffprobe, path.join(bin, 'ffprobe.exe'));
  console.log('Bundled the FFmpeg tools found on this computer.');
} else {
  console.log('FFmpeg was not found. The installed app will use FFmpeg from PATH.');
}
