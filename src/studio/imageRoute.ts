/**
 * Where images get made. On your own computer Bopzi asks the Codex app directly. On a public Bopzi the site
 * cannot do that, so a small helper running on the visitor's computer does it, on the visitor's own plan.
 */

export const HELPER = 'http://127.0.0.1:47615';
/** The oldest helper this page works with. Raise it whenever the page starts to rely on something new in the helper. */
export const MIN_HELPER = 3;

export type Via = 'codex' | 'helper';
/** What the browser says about letting this site talk to a program on the same computer. */
export type Permission = 'granted' | 'prompt' | 'denied' | 'unknown';
export type Link = {
  via: Via;
  connected: boolean;
  reason: string;
  /** Only meaningful for the helper. */
  helperUp: boolean;
  /** True when the helper runs but is older than this page needs. */
  helperOutdated?: boolean;
  permission: Permission;
};

/**
 * Chrome and Edge ask the person before a public site may reach a program on their computer.
 * Other browsers do not have this permission; for them the answer is simply unknown.
 */
export async function localAccess(): Promise<Permission> {
  try {
    const status = await navigator.permissions.query({ name: 'local-network-access' as PermissionName });
    return status.state;
  } catch {
    return 'unknown';
  }
}

async function helper(): Promise<{ up: boolean; connected: boolean; reason: string; version: number }> {
  try {
    const body = await (await fetch(`${HELPER}/status`, { cache: 'no-store' })).json();
    if (!body?.helper) throw new Error('not the helper');
    return { up: true, connected: !!body.connected, reason: body.reason || '', version: Number(body.version) || 1 };
  } catch {
    return { up: false, connected: false, reason: '', version: 0 };
  }
}

/** For trying the helper on your own computer: `localStorage['bopzi:image-route'] = 'helper'`. */
export function forcedVia(): Via | null {
  try {
    return localStorage.getItem('bopzi:image-route') === 'helper' ? 'helper' : null;
  } catch {
    return null;
  }
}

export async function findLink(): Promise<Link> {
  if (forcedVia() !== 'helper') {
    const own: { connected?: boolean; reason?: string; local?: boolean } = await fetch('/api/thumbnail', { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ connected: false, reason: 'The studio could not be reached. Check your connection.', local: true }));
    // Bopzi is running on this computer: Codex is asked directly and no helper is involved.
    if (own.connected || own.local) return { via: 'codex', connected: !!own.connected, reason: own.reason || '', helperUp: false, permission: 'unknown' };
  }
  const [state, permission] = await Promise.all([helper(), localAccess()]);
  const reason = state.up
    ? state.reason
    : permission === 'denied'
      ? 'Your browser is blocking Bopzi from reaching the helper on this computer.'
      : 'Connect your own ChatGPT plan to generate here.';
  const outdated = state.up && state.version < MIN_HELPER;
  return { via: 'helper', connected: state.up && !outdated && state.connected, reason: outdated ? 'Your Bopzi helper is out of date. Download the new one and start it again.' : reason, helperUp: state.up, helperOutdated: outdated, permission };
}
