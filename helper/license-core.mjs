// Bopzi license keys. A key is signed with the owner's private key and names one computer, so it can be
// checked with no server. Disabled keys are named in a signed list the app downloads.
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';

const KEY_PREFIX = 'BOPZI-';
const LICENSE_CONTEXT = 'bopzi-license-v1\n';
const LIST_CONTEXT = 'bopzi-disabled-v1\n';
const b64 = (data) => Buffer.from(data).toString('base64url');

export const accountId = (username) => createHash('sha256').update(`bopzi:${username}`).digest('hex').slice(0, 24);
export const deviceCodeOf = (fingerprint) => createHash('sha256').update(`bopzi-device:${fingerprint}`).digest('hex').slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
const cleanDevice = (code) => String(code ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
export const usernameOf = (value) => (typeof value === 'string' && /^[a-z0-9_.-]{3,32}$/i.test(value.trim()) ? value.trim().toLowerCase() : '');

/** The private key's own public half, to tell whether this computer really holds the owner's key. */
export const publicKeyOf = (privatePem) => createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'pem' }).toString();

export function makeKey({ username, device, issuedAt = Date.now() }, privatePem) {
  const name = usernameOf(username);
  const code = cleanDevice(device);
  if (!name) throw new Error('Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.');
  if (code.length !== 16) throw new Error('That device code is not valid. It has 16 letters and numbers.');
  const payload = b64(JSON.stringify({ u: name, d: code, i: Math.floor(issuedAt / 1000), n: randomBytes(6).toString('base64url') }));
  const signature = sign(null, Buffer.from(LICENSE_CONTEXT + payload), privatePem);
  return { key: `${KEY_PREFIX}${payload}.${b64(signature)}`, id: licenseId(payload), username: name, device: code };
}

function licenseId(payload) {
  return createHash('sha256').update(payload).digest('hex').slice(0, 20);
}

/** Returns who a key belongs to, or null if it was not signed by the owner. */
export function readKey(key, publicPem) {
  const text = String(key ?? '').trim();
  if (!text.startsWith(KEY_PREFIX)) return null;
  const [payload, signature] = text.slice(KEY_PREFIX.length).split('.');
  if (!payload || !signature) return null;
  try {
    if (!verify(null, Buffer.from(LICENSE_CONTEXT + payload), publicPem, Buffer.from(signature, 'base64url'))) return null;
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!usernameOf(body.u) || cleanDevice(body.d).length !== 16) return null;
    return { username: body.u, device: cleanDevice(body.d), id: licenseId(payload) };
  } catch {
    return null;
  }
}

export const keyFitsDevice = (license, deviceCode) => !!license && license.device === cleanDevice(deviceCode);

export function signList(disabled, privatePem, at = Date.now()) {
  const body = JSON.stringify({ disabled: [...new Set(disabled)].sort(), at });
  return JSON.stringify({ body, signature: b64(sign(null, Buffer.from(LIST_CONTEXT + body), privatePem)) });
}

/** Returns the list, or null if it was not signed by the owner or is older than one already seen. */
export function readList(text, publicPem, newerThan = 0) {
  try {
    const { body, signature } = JSON.parse(text);
    if (typeof body !== 'string' || typeof signature !== 'string') return null;
    if (!verify(null, Buffer.from(LIST_CONTEXT + body), publicPem, Buffer.from(signature, 'base64url'))) return null;
    const list = JSON.parse(body);
    if (!Array.isArray(list.disabled) || !Number.isSafeInteger(list.at) || list.at < newerThan) return null;
    return list;
  } catch {
    return null;
  }
}
