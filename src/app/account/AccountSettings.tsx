'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { currentAdmin, currentUser } from '@/components/AuthGate';

type License = { id: string; username: string; device: string; disabled?: boolean };
type Made = { username: string; key: string };

const send = async (body: object) => {
  const res = await fetch('/api/access/accounts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify(body) });
  const reply = (await res.json().catch(() => ({}))) as { error?: string; warning?: string; licenses?: License[] } & Partial<Made>;
  if (!res.ok || reply.error) throw new Error(reply.error ?? 'That did not work. Try again.');
  return reply;
};

function Licenses() {
  const [licenses, setLicenses] = useState<License[] | null>(null);
  const [name, setName] = useState('');
  const [device, setDevice] = useState('');
  const [made, setMade] = useState<Made | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const refresh = useCallback(async () => { try { setLicenses((await send({ action: 'list' })).licenses ?? []); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load licenses.'); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const reply = await send({ action: 'add', username: name.trim(), device: device.trim() });
      if (reply.key && reply.username) { setMade({ username: reply.username, key: reply.key }); setCopied(false); setName(''); setDevice(''); }
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not make that key.'); }
  };
  const toggle = async (license: License) => {
    setError('');
    try {
      setWarning((await send({ action: license.disabled ? 'enable' : 'disable', id: license.id })).warning ?? '');
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'That did not work.'); }
  };
  const copy = async () => {
    if (!made) return;
    await navigator.clipboard.writeText(made.key).catch(() => undefined);
    setCopied(true);
  };
  return (
    <section className="acc-card">
      <h2>Licenses</h2>
      <p className="acc-hint">Ask the person for the device code on their Bopzi sign-in screen.</p>
      <form className="acc-form" onSubmit={(e) => void create(e)}>
        <label>Username<input autoComplete="off" spellCheck={false} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Device code<input autoComplete="off" spellCheck={false} maxLength={24} placeholder="XXXX-XXXX-XXXX-XXXX" value={device} onChange={(e) => setDevice(e.target.value)} /></label>
        <button type="submit" className="acc-go" disabled={name.trim().length < 3 || !device.trim()}>Create license</button>
      </form>
      {made && <div className="acc-shown" role="status">
        <p>Send this key to <b>{made.username}</b>. It only works on their computer.</p>
        <code>{made.key}</code>
        <button type="button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy key'}</button>
      </div>}
      {error && <p className="acc-note is-bad" role="alert">{error}</p>}
      {warning && <p className="acc-note is-bad" role="status">{warning}</p>}
      {licenses === null ? !error && <p className="acc-hint">Loading licenses…</p> : licenses.length === 0 ? <p className="acc-hint">No licenses yet.</p> : <ul>{licenses.map((l) => <li key={l.id}>
        <span><b>{l.username}</b><small>{l.disabled ? 'Disabled' : 'Active'} · {l.device.replace(/(.{4})(?=.)/g, '$1-')}</small></span>
        <span className="acc-actions"><button type="button" className={l.disabled ? undefined : 'is-bad'} onClick={() => void toggle(l)}>{l.disabled ? 'Enable' : 'Disable'}</button></span>
      </li>)}</ul>}
    </section>
  );
}

export default function AccountSettings() {
  return (
    <main className="acc">
      <h1>Account</h1>
      <p className="acc-who">Licensed to <b>{currentUser || 'this computer'}</b></p>
      {currentAdmin && <Licenses />}
    </main>
  );
}
