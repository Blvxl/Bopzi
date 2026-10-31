import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { accountId, deviceCodeOf, keyFitsDevice, publicKeyOf, readKey, readList, type License } from '../../helper/license-core.mjs';
import { LICENSE_PUBLIC_KEY } from './license-public';

/**
 * Who may open Bopzi: a license key signed by the owner and locked to this computer. Keys are checked
 * offline. A signed list of disabled keys is fetched from GitHub, and has to be seen at least once a week.
 */
type Saved = { key: string; checkedAt: number; listAt: number };
export type Access = { required: boolean; signedIn: boolean; username?: string; id?: string; admin?: boolean; reason?: string; deviceCode: string };

export const DISABLED_LIST_URL = 'https://raw.githubusercontent.com/Blvxl/bopzi-licenses/main/disabled.json';
const home = path.join(os.homedir(), '.bopzi');
const FILE = path.join(process.env.BOPZI_DATA_DIR ?? home, 'license.json');
export const OWNER_KEY_FILE = path.join(home, 'license-private.pem');
export const OWNER_NAME = 'blvxl';
/** How often the list is fetched while Bopzi is open. */
const RECHECK_MS = 60 * 60_000;
/** How long Bopzi keeps working without reaching the list. */
const OFFLINE_MS = 7 * 24 * 3_600_000;

const load = async (): Promise<Saved | null> => { try { return JSON.parse(await readFile(FILE, 'utf8')) as Saved; } catch { return null; } };
const store = async (saved: Saved) => { await mkdir(path.dirname(FILE), { recursive: true }); await writeFile(FILE, JSON.stringify(saved), { mode: 0o600 }); };

let device = '';
/** A code for this computer. Keys are made for this code, so a key does nothing on another machine. */
export async function deviceCode() {
  if (device) return device;
  const windowsId = process.platform !== 'win32' ? '' : await new Promise<string>((resolve) => {
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true, timeout: 5000 }, (error, out) => resolve(error ? '' : /MachineGuid\s+\S+\s+(\S+)/.exec(out)?.[1] ?? ''));
  });
  device = deviceCodeOf(createHash('sha256').update([windowsId, os.hostname(), os.platform(), os.arch()].join('|')).digest('hex'));
  return device;
}

/** Whether this computer holds the owner's real signing key. A made-up key file does not match. */
export async function isOwner() {
  try { return publicKeyOf(await readFile(OWNER_KEY_FILE, 'utf8')).trim() === LICENSE_PUBLIC_KEY.trim(); } catch { return false; }
}

const fetchList = async (newerThan: number) => {
  const res = await fetch(`${DISABLED_LIST_URL}?t=${Math.floor(Date.now() / RECHECK_MS)}`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  if (!res.ok) return null;
  return readList(await res.text(), LICENSE_PUBLIC_KEY, newerThan);
};

const allowed = (license: License, admin = false) => ({ required: true, signedIn: true, username: license.username, id: accountId(license.username), admin });

export async function accessStatus(): Promise<Access> {
  const code = await deviceCode();
  if (await isOwner()) return { ...allowed({ username: OWNER_NAME, device: code, id: 'owner' }, true), deviceCode: code };
  const saved = await load();
  const out = (reason?: string): Access => ({ required: true, signedIn: false, reason, deviceCode: code });
  if (!saved) return out();
  const license = readKey(saved.key, LICENSE_PUBLIC_KEY);
  if (!license || !keyFitsDevice(license, code)) { await rm(FILE, { force: true }); return out('This key does not belong to this computer.'); }
  const signedIn = { ...allowed(license), deviceCode: code };
  // A clock set backwards does not earn more offline time.
  const age = Date.now() - saved.checkedAt;
  if (age >= 0 && age < RECHECK_MS) return signedIn;
  const list = await fetchList(saved.listAt).catch(() => null);
  if (list) {
    if (list.disabled.includes(license.id)) { await rm(FILE, { force: true }); return out('This license has been disabled.'); }
    await store({ ...saved, checkedAt: Date.now(), listAt: list.at });
    return signedIn;
  }
  if (age >= 0 && age < OFFLINE_MS) return signedIn;
  return out('Connect to the internet so Bopzi can check your license.');
}

export const hasAccess = async () => (await accessStatus()).signedIn;

export async function activate(key: string): Promise<Access> {
  const license = readKey(key, LICENSE_PUBLIC_KEY);
  if (!license) throw new Error('That license key is not valid.');
  const code = await deviceCode();
  if (!keyFitsDevice(license, code)) throw new Error('This key was made for a different computer.');
  const list = await fetchList(0).catch(() => null);
  if (list?.disabled.includes(license.id)) throw new Error('This license has been disabled.');
  await store({ key: key.trim(), checkedAt: Date.now(), listAt: list?.at ?? 0 });
  return { ...allowed(license), deviceCode: code };
}

export const deactivate = () => rm(FILE, { force: true });
