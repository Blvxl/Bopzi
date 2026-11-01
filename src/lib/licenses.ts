import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { makeKey, signList } from '../../helper/license-core.mjs';
import { OWNER_KEY_FILE } from './access';

/** The owner's record of the keys handed out. It only ever exists on the owner's computer. */
export type Deal = { game: string; share: number; date: string };
export type Issued = { id: string; username: string; device: string; issuedAt: number; disabled?: boolean; removed?: boolean; deal?: Deal };

/** Checks a deal as typed into the panel, so the record stays clean. */
function dealOf(value: unknown): Deal {
  const { game, share, date } = (value ?? {}) as Record<string, unknown>;
  const name = typeof game === 'string' ? game.trim() : '';
  const percent = Number(share);
  const day = typeof date === 'string' ? date : '';
  if (!name || name.length > 120) throw new Error('Enter their Roblox game.');
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('The share has to be between 0 and 100 percent.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw new Error('Enter the date of the deal.');
  return { game: name, share: Math.round(percent * 100) / 100, date: day };
}

const home = path.join(os.homedir(), '.bopzi');
const RECORD = path.join(home, 'licenses.json');
/** A clone of the public repository that serves the disabled list. */
const LIST_REPO = path.join(home, 'bopzi-licenses');
const run = promisify(execFile);

const privateKey = () => readFile(OWNER_KEY_FILE, 'utf8');
export const listIssued = async (): Promise<Issued[]> => { try { return JSON.parse(await readFile(RECORD, 'utf8')) as Issued[]; } catch { return []; } };
const saveIssued = async (issued: Issued[]) => { await mkdir(home, { recursive: true }); await writeFile(RECORD, JSON.stringify(issued, null, 2), { mode: 0o600 }); };

export async function issue(username: string, device: string, value: unknown) {
  const deal = dealOf(value);
  const made = makeKey({ username, device }, await privateKey());
  const issued = await listIssued();
  if (issued.some((i) => i.username === made.username && !i.removed)) throw new Error('That username already exists. Remove it first to make a new key.');
  await saveIssued([...issued, { id: made.id, username: made.username, device: made.device, issuedAt: Date.now(), deal }]);
  return { key: made.key, username: made.username };
}

/** Writes the signed list and pushes it, so every copy of Bopzi sees the change at its next check. */
async function publish(issued: Issued[]) {
  const text = signList(issued.filter((i) => i.disabled).map((i) => i.id), await privateKey());
  await writeFile(path.join(home, 'disabled.json'), text, { mode: 0o600 });
  if (!existsSync(path.join(LIST_REPO, '.git'))) return 'Saved here, but not published yet: the bopzi-licenses repository is not set up.';
  await writeFile(path.join(LIST_REPO, 'disabled.json'), text);
  try {
    await run('git', ['add', 'disabled.json'], { cwd: LIST_REPO, windowsHide: true });
    await run('git', ['commit', '-m', 'Update disabled licenses'], { cwd: LIST_REPO, windowsHide: true });
    await run('git', ['push'], { cwd: LIST_REPO, windowsHide: true, timeout: 30_000 });
    return '';
  } catch {
    return 'Saved here, but it could not be pushed to GitHub. Try again.';
  }
}

export async function setDeal(id: string, value: unknown) {
  const issued = await listIssued();
  const entry = issued.find((i) => i.id === id);
  if (!entry) throw new Error('No such user.');
  entry.deal = dealOf(value);
  await saveIssued(issued);
  return {};
}

/** Removing someone hides them from the panel, and keeps their key on the disabled list for good. */
export async function remove(id: string) {
  const issued = await listIssued();
  const entry = issued.find((i) => i.id === id);
  if (!entry) throw new Error('No such user.');
  entry.disabled = true;
  entry.removed = true;
  await saveIssued(issued);
  return { warning: await publish(issued) };
}

export async function setDisabled(id: string, disabled: boolean) {
  const issued = await listIssued();
  const entry = issued.find((i) => i.id === id);
  if (!entry) throw new Error('No such license.');
  entry.disabled = disabled;
  await saveIssued(issued);
  return { warning: await publish(issued) };
}
