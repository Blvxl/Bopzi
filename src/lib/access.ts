import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { codexAccount } from '../../helper/codex-core.mjs';
import { accountId, deviceCodeOf, isOwnerEmail, keyFitsDevice, publicKeyOf, readKey, readList, type License } from '../../helper/license-core.mjs';
import { LICENSE_PUBLIC_KEY } from './license-public';

/**
 * Who may open Bopzi: a license key signed by the owner and locked to this computer. Keys are checked
 * offline. A signed list of disabled keys is fetched from GitHub, and has to be seen at least once a week.
 * Being signed in lives only in the server's memory, so every launch of Bopzi starts signed out.
 * The file only remembers when the list was last seen, and never the key. An update is the one exception: see keepForUpdate.
 */
type Saved = { id?: string; checkedAt: number; listAt: number; disabled?: boolean };
export type Access = { required: boolean; signedIn: boolean; username?: string; id?: string; admin?: boolean; reason?: string; deviceCode: string };

const DISABLED_LIST_API = 'https://api.github.com/repos/Blvxl/bopzi-licenses/contents/disabled.json';
const DISABLED_LIST_URL = 'https://raw.githubusercontent.com/Blvxl/bopzi-licenses/main/disabled.json';
const home = path.join(os.homedir(), '.bopzi');
const FILE = path.join(process.env.BOPZI_DATA_DIR ?? home, 'license.json');
const RESUME = path.join(process.env.BOPZI_DATA_DIR ?? home, 'resume.json');
export const OWNER_KEY_FILE = path.join(home, 'license-private.pem');
export const OWNER_NAME = 'blvxl';
/** How often the list is fetched while Bopzi is open. */
const RECHECK_MS = 60 * 60_000;
/** How long Bopzi keeps working without reaching the list. */
const OFFLINE_MS = 7 * 24 * 3_600_000;
/** How long a key may wait for an update to finish installing. */
const RESUME_MS = 5 * 60_000;

const load = async (): Promise<Saved | null> => { try { return JSON.parse(await readFile(FILE, 'utf8')) as Saved; } catch { return null; } };
const store = async (saved: Saved) => { await mkdir(path.dirname(FILE), { recursive: true }); await writeFile(FILE, JSON.stringify(saved), { mode: 0o600 }); };

const memory = globalThis as { bopziSession?: License | null; bopziKey?: string };
const session = () => memory.bopziSession ?? null;

let device = '';
/** A code for this computer. Keys are made for this code, so a key does nothing on another machine. */
export async function deviceCode() {
  if (device) return device;
  const windowsId = process.platform !== 'win32' ? '' : await new Promise<string>((resolve) => {
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? '' : /MachineGuid\s+\S+\s+(\S+)/.exec(out)?.[1] ?? ''));
  });
  device = deviceCodeOf(createHash('sha256').update([windowsId, os.hostname(), os.platform()].join('|')).digest('hex'));
  return device;
}

/** Whether this computer holds the owner's real signing key. A made-up key file does not match. */
export async function isOwner() {
  try { return publicKeyOf(await readFile(OWNER_KEY_FILE, 'utf8')).trim() === LICENSE_PUBLIC_KEY.trim(); } catch { return false; }
}

/** GitHub's API refreshes within a minute. The plain file can be minutes old, so it is only the fallback. */
/** The admin panel needs both: the owner's signing key on this computer and the owner's ChatGPT account signed in. */
export async function isAdmin() {
  if (session()?.username !== OWNER_NAME || !(await isOwner())) return false;
  return isOwnerEmail((await codexAccount())?.email);
}

const fetchList = async (newerThan: number) => {
  for (const [url, headers] of [[DISABLED_LIST_API, { accept: 'application/vnd.github.raw', 'user-agent': 'Bopzi' }], [DISABLED_LIST_URL, {}]] as const) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' }).catch(() => null);
    const list = res?.ok ? readList(await res.text(), LICENSE_PUBLIC_KEY, newerThan) : null;
    if (list) return list;
  }
  return null;
};

const allowed = (license: License, admin = false) => ({ required: true, signedIn: true, username: license.username, id: accountId(license.username), admin });

export async function accessStatus(): Promise<Access> {
  const code = await deviceCode();
  if (!session()) await resumeAfterUpdate();
  const out = (reason?: string): Access => ({ required: true, signedIn: false, reason, deviceCode: code });
  const license = session();
  if (!license) return out();
  if (license.username === OWNER_NAME && await isOwner()) return { ...allowed(license, await isAdmin()), deviceCode: code };
  const signedIn = { ...allowed(license), deviceCode: code };
  const saved = await load();
  if (!saved) { memory.bopziSession = null; return out(); }
  // A clock set backwards does not earn more offline time.
  const age = Date.now() - saved.checkedAt;
  if (age >= 0 && age < RECHECK_MS) return signedIn;
  const list = await fetchList(saved.listAt).catch(() => null);
  if (list) {
    if (list.disabled.includes(license.id)) {
      memory.bopziSession = null;
      await store({ ...saved, disabled: true });
      return out('This license has been disabled.');
    }
    await store({ ...saved, checkedAt: Date.now(), listAt: list.at });
    return signedIn;
  }
  if (age >= 0 && age < OFFLINE_MS) return signedIn;
  memory.bopziSession = null;
  return out('Connect to the internet so Bopzi can check your license.');
}

export const hasAccess = async () => (await accessStatus()).signedIn;

/** An update restarts Bopzi, and that isn't closing it. The key waits on disk for a few minutes, for one use. */
export async function keepForUpdate() {
  if (!memory.bopziKey) return;
  await writeFile(RESUME, JSON.stringify({ key: memory.bopziKey, until: Date.now() + RESUME_MS }), { mode: 0o600 });
}

async function resumeAfterUpdate() {
  const saved = await readFile(RESUME, 'utf8').catch(() => '');
  if (!saved) return;
  await rm(RESUME, { force: true });
  const { key, until } = JSON.parse(saved) as { key: string; until: number };
  if (Date.now() < until) await activate(key).catch(() => undefined);
}

export async function activate(key: string): Promise<Access> {
  const license = readKey(key, LICENSE_PUBLIC_KEY);
  if (!license) throw new Error('That license key is not valid.');
  const code = await deviceCode();
  if (!keyFitsDevice(license, code)) throw new Error('This key was made for a different computer.');
  if (license.username === OWNER_NAME && await isOwner()) {
    memory.bopziSession = license;
    memory.bopziKey = key.trim();
    return { ...allowed(license, await isAdmin()), deviceCode: code };
  }
  const saved = await load();
  const known = saved?.id === license.id ? saved : null;
  const list = await fetchList(known?.listAt ?? 0).catch(() => null);
  if (list?.disabled.includes(license.id) || (!list && known?.disabled)) {
    await store({ id: license.id, checkedAt: known?.checkedAt ?? 0, listAt: known?.listAt ?? 0, disabled: true });
    throw new Error('This license has been disabled.');
  }
  // Signing in again never earns more offline time. Without the list, a first activation works, and the very next check looks again.
  const age = known ? Date.now() - known.checkedAt : 0;
  if (!list && (age < 0 || age >= OFFLINE_MS)) throw new Error('Connect to the internet so Bopzi can check your license.');
  await store({ id: license.id, checkedAt: list ? Date.now() : known?.checkedAt ?? Date.now() - RECHECK_MS, listAt: list?.at ?? known?.listAt ?? 0 });
  memory.bopziSession = license;
  memory.bopziKey = key.trim();
  return { ...allowed(license), deviceCode: code };
}

export const deactivate = () => { memory.bopziSession = null; memory.bopziKey = ''; };
