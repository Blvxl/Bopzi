'use client';

import { Check, Copy } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { claimProjects, setOwner } from '@/lib/db';
import { Lockup } from './Logo';
import './auth.css';

type Access = { required: boolean; signedIn: boolean; username?: string; id?: string; admin?: boolean; reason?: string; deviceCode?: string };

/** Pages anyone may read: the license and the privacy notes. */
const OPEN = ['/license', '/about'];
const post = (body: object) => fetch('/api/access', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Access & { error?: string }>);

/** Who is signed in, for the account menu. */
export let currentUser = '';
/** Only decides what the app shows; making keys also needs the owner's private key. */
export let currentAdmin = false;

export const logOut = async () => {
  await post({ action: 'logout' }).catch(() => undefined);
  currentUser = '';
  currentAdmin = false;
  window.location.assign('/');
};

/** Nothing in Bopzi opens without a license key made for this computer. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const open = OPEN.some((p) => path.startsWith(p));
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking');
  const [key, setKey] = useState('');
  const [device, setDevice] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = useCallback(async (id: string, name: string, admin = false) => {
    setOwner(id);
    currentUser = name;
    currentAdmin = admin;
    await claimProjects().catch(() => { /* the projects stay as they were and are offered again next time */ });
    setState('in');
  }, []);
  const leave = useCallback((reason = '') => {
    currentUser = '';
    currentAdmin = false;
    setMessage(reason);
    setState('out');
  }, []);
  const check = useCallback(async () => {
    const access = await fetch('/api/access', { cache: 'no-store' }).then((r) => r.json() as Promise<Access>).catch((): Access => ({ required: true, signedIn: false, reason: 'Bopzi could not reach its local server.' }));
    if (access.deviceCode) setDevice(access.deviceCode);
    if (access.signedIn) await enter(access.id ?? 'local', access.username ?? '', !!access.admin);
    else leave(access.reason);
  }, [enter, leave]);

  useEffect(() => {
    void check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [check, enter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const done = await post({ action: 'login', key: key.trim() }).catch(() => ({ error: 'Bopzi could not reach its local server.' }) as Access & { error?: string });
    setBusy(false);
    if (done.error || !done.signedIn) { setMessage(done.error ?? 'That key did not work.'); return; }
    setKey('');
    await enter(done.id ?? 'local', done.username ?? '', !!done.admin);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(device).catch(() => undefined);
    setCopied(true);
  };

  if (open || state === 'in') return children;
  return (
    <main className="auth">
      {state === 'out' && <form className="auth-card" aria-labelledby="auth-title" onSubmit={(e) => void submit(e)}>
        <Lockup size={34} bg="#191816" className="auth-brand" />
        <h1 id="auth-title">Activate Bopzi</h1>
        <p>Send your device code to get a license key for this computer.</p>
        <div className="auth-device"><span>Device code</span><code>{device}</code><button type="button" aria-label="Copy device code" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
        <label>License key<textarea required autoFocus spellCheck={false} rows={3} maxLength={1000} value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <button type="submit" className="auth-go" disabled={busy || !key.trim()}>{busy ? 'Activating' : 'Activate'}</button>
        {message && <p className="auth-error" role="alert">{message}</p>}
      </form>}
    </main>
  );
}
