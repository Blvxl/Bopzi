// Cloudflare refuses any single uploaded file over 25 MiB. The background remover's runtime (onnxruntime) gets
// copied into the build output at about that size, but at run time it is fetched from jsDelivr instead (see
// node_modules/@huggingface/transformers/src/backends/onnx.js), so the copies can be left out of the upload.
import { readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const LIMIT = 24 * 1024 * 1024;
const dir = process.argv[2] ?? '.open-next/assets';

function walk(folder) {
  for (const name of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, name.name);
    if (name.isDirectory()) { walk(file); continue; }
    const size = statSync(file).size;
    if (size > LIMIT) { rmSync(file); console.log(`Left out ${file} (${(size / 1048576).toFixed(1)} MiB): too large for Cloudflare`); }
  }
}

try { walk(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
