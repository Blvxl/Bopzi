// Makes the owner's signing key, once. The private half stays in ~/.bopzi and must never be shared or committed.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(os.homedir(), '.bopzi');
const file = path.join(dir, 'license-private.pem');
if (existsSync(file)) { console.error('A signing key already exists. Replacing it would break every key you have given out.'); process.exit(1); }

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
mkdirSync(dir, { recursive: true });
writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
writeFileSync(path.join(root, 'src', 'lib', 'license-public.ts'), `/** The owner's public signing key. It can only check licenses, never make them. */\nexport const LICENSE_PUBLIC_KEY = \`${pem}\n\`;\n`);
console.log('Signing key created.');
