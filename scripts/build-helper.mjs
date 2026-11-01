// Writes the helper download as a plain file, so hosts that cannot read files while running (Cloudflare) can serve it.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleHelper } from '../helper/bundle-helper.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
await mkdir(path.join(root, 'public'), { recursive: true });
await writeFile(path.join(root, 'public', 'bopzi-helper.mjs'), await bundleHelper(path.join(root, 'helper'), origin));
console.log(`Helper written for ${origin}`);
