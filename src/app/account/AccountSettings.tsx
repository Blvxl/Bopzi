'use client';

import { Check, Copy, MoreHorizontal, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAdmin, currentUser, logOut } from '@/components/AuthGate';
import { HELP_TEXT } from '@/lib/site';
import { HOSTED_ACCOUNTS } from '@/lib/supabase/config';
import { supabaseBrowser } from '@/lib/supabase/browser';

type Deal = { game: string; share: number; date: string };
type Game = { name: string; url: string; playing: number; visits: number; imageUrl?: string; iconUrl?: string };
type License = { id: string; username: string; device: string; disabled?: boolean; deal?: Deal; game?: Game | null };
type Made = { username: string; key: string };

const send = async (body: object) => {
  const res = await fetch('/api/access/accounts', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify(body) });
  const reply = (await res.json().catch(() => ({}))) as { error?: string; warning?: string; licenses?: License[] } & Partial<Made>;
  if (!res.ok || reply.error) throw new Error(reply.error ?? 'That did not work. Try again.');
  return reply;
};
const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const formatDevice = (value: string) => value.replace(/(.{4})(?=.)/g, '$1-');
const today = () => new Date().toLocaleDateString('en-CA');
const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const formatCount = (value: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** Game, share and date: the same fields for a new user and for changing a deal. */
function DealFields({ game, share, date, onChange }: { game: string; share: string; date: string; onChange: (patch: Partial<{ game: string; share: string; date: string }>) => void }) {
  return <>
    <label>Roblox game link<input autoComplete="off" spellCheck={false} maxLength={120} placeholder="roblox.com/games/…" value={game} onChange={(e) => onChange({ game: e.target.value })} /></label>
    <div className="adm-pair">
      <label>Their share to you<span className="adm-percent"><input inputMode="decimal" autoComplete="off" maxLength={6} value={share} onChange={(e) => onChange({ share: e.target.value })} /><i>%</i></span></label>
      <label>Deal date<input type="date" value={date} onChange={(e) => onChange({ date: e.target.value })} /></label>
    </div>
  </>;
}

/** A native dialog, so focus, Escape and the backdrop behave the way the system's do. */
function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDialogElement>(null);
  useEffect(() => { box.current?.showModal(); }, []);
  return <dialog ref={box} className="adm-modal" aria-label={label} onCancel={(e) => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}

function AddUser({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [device, setDevice] = useState('');
  const [deal, setDeal] = useState({ game: '', share: '5', date: today() });
  const [made, setMade] = useState<Made | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setWorking(true);
    try {
      const reply = await send({ action: 'add', username: name.trim(), device: device.trim(), deal: { ...deal, share: Number(deal.share) } });
      if (reply.key && reply.username) setMade({ username: reply.username, key: reply.key });
      onAdded();
    } catch (err) { setError(messageOf(err, 'Could not add that user.')); }
    finally { setWorking(false); }
  };
  const copy = async () => {
    if (!made) return;
    const ok = await navigator.clipboard.writeText(made.key).then(() => true, () => false);
    setCopied(ok);
    if (!ok) setError('Could not copy it. Select the key and copy it by hand.');
  };

  if (made) return (
    <Modal label={`Key for ${made.username}`} onClose={onClose}>
      <h2>Key for {made.username}</h2>
      <p>Send this to them. It only works on their computer, and it won&apos;t be shown again.</p>
      <code>{made.key}</code>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-modal-actions">
        <button type="button" className="adm-quiet" onClick={onClose}>Done</button>
        <button type="button" className="adm-go" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy key'}</button>
      </div>
    </Modal>
  );
  return (
    <Modal label="Add user" onClose={onClose}>
      <h2>Add user</h2>
      <p>Their device code is on Bopzi&apos;s activation screen.</p>
      <form onSubmit={(e) => void create(e)}>
        <label>Username<input autoFocus autoComplete="off" spellCheck={false} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Device code<input autoComplete="off" spellCheck={false} maxLength={24} placeholder="XXXX-XXXX-XXXX-XXXX" value={device} onChange={(e) => setDevice(e.target.value)} /></label>
        <DealFields {...deal} onChange={(patch) => setDeal((v) => ({ ...v, ...patch }))} />
        {error && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-modal-actions">
          <button type="button" className="adm-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-go" disabled={working || name.trim().length < 3 || !device.trim() || !deal.game.trim() || !deal.share || !deal.date}>{working ? 'Creating' : 'Create key'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditDeal({ license, onClose, onSaved }: { license: License; onClose: () => void; onSaved: () => void }) {
  const [deal, setDeal] = useState({ game: license.deal?.game ?? '', share: String(license.deal?.share ?? 5), date: license.deal?.date ?? today() });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setWorking(true);
    try { await send({ action: 'deal', id: license.id, deal: { ...deal, share: Number(deal.share) } }); onSaved(); }
    catch (err) { setError(messageOf(err, 'Could not save the deal.')); setWorking(false); }
  };
  return (
    <Modal label={`Deal with ${license.username}`} onClose={onClose}>
      <h2>Deal with {license.username}</h2>
      <p>Device {formatDevice(license.device)}</p>
      <form onSubmit={(e) => void save(e)}>
        <DealFields {...deal} onChange={(patch) => setDeal((v) => ({ ...v, ...patch }))} />
        {error && <p className="adm-error" role="alert">{error}</p>}
        <div className="adm-modal-actions">
          <button type="button" className="adm-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-go" disabled={working || !deal.game.trim() || !deal.share || !deal.date}>{working ? 'Saving' : 'Save deal'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveUser({ license, onClose, onRemove }: { license: License; onClose: () => void; onRemove: () => void }) {
  return (
    <Modal label={`Remove ${license.username}`} onClose={onClose}>
      <h2>Remove {license.username}?</h2>
      <p>Their key stops working the next time Bopzi checks. To add them again, make a new key.</p>
      <div className="adm-modal-actions">
        <button type="button" className="adm-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="adm-danger" onClick={onRemove}>Remove</button>
      </div>
    </Modal>
  );
}

function Row({ license, busy, onToggle, onEdit, onRemove }: { license: License; busy: boolean; onToggle: () => void; onEdit: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); };
  }, [open]);
  const { deal, game } = license;
  return (
    <li className={license.disabled ? 'adm-card is-off' : 'adm-card'}>
      <div className="adm-hero">
        {game?.imageUrl && <img className="adm-art" src={game.imageUrl} alt="" />}
        {license.disabled && <span className="adm-off">Disabled</span>}
        <div className="adm-who">
          {game?.iconUrl && <img src={game.iconUrl} alt="" />}
          <span>
            <b>{license.username}</b>
            <small>{game ? <a href={game.url} target="_blank" rel="noreferrer">{game.name}</a> : deal?.game ?? 'No deal recorded'}</small>
          </span>
          {deal && <em>{deal.share}%</em>}
        </div>
      </div>
      <div className="adm-stats">
        <span>{game ? `${formatCount(game.playing)} playing · ${formatCount(game.visits)} visits` : ''}</span>
        {deal && <span>Since {formatDate(deal.date)}</span>}
      </div>
      <div className="adm-more" ref={box}>
        <button type="button" aria-label={`Options for ${license.username}`} aria-expanded={open} aria-haspopup="menu" disabled={busy} onClick={() => setOpen((v) => !v)}><MoreHorizontal size={18} /></button>
        {open && <div role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }}>Edit deal</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onToggle(); }}>{license.disabled ? 'Enable' : 'Disable'}</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); onRemove(); }}>Remove</button>
        </div>}
      </div>
    </li>
  );
}

function AdminPanel() {
  const [licenses, setLicenses] = useState<License[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<License | null>(null);
  const [editing, setEditing] = useState<License | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setLicenses((await send({ action: 'list' })).licenses ?? []); }
    catch (e) { setNotice(messageOf(e, 'Could not load users.')); setLicenses((v) => v ?? []); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const change = async (body: object) => {
    setNotice(''); setBusy(true); setRemoving(null);
    try { setNotice((await send(body)).warning ?? ''); await refresh(); }
    catch (e) { setNotice(messageOf(e, 'That did not work. Try again.')); }
    finally { setBusy(false); }
  };

  const active = licenses?.filter((l) => !l.disabled).length ?? 0;
  return (
    <main className="adm">
      <header className="adm-head">
        <div>
          <h1>Admin panel</h1>
          <p>{licenses === null ? ' ' : active === 1 ? '1 active user' : `${active} active users`}</p>
        </div>
        <button type="button" className="adm-go" onClick={() => setAdding(true)}><Plus size={17} />Add user</button>
      </header>
      {notice && <p className="adm-error" role="alert">{notice}</p>}
      {licenses !== null && (licenses.length === 0
        ? <div className="adm-empty"><b>No users yet</b><span>Add someone you&apos;ve accepted to give them a key.</span></div>
        : <ul className="adm-list">{licenses.map((l) => <Row key={l.id} license={l} busy={busy} onToggle={() => void change({ action: l.disabled ? 'enable' : 'disable', id: l.id })} onEdit={() => setEditing(l)} onRemove={() => setRemoving(l)} />)}</ul>)}
      {adding && <AddUser onClose={() => setAdding(false)} onAdded={() => void refresh()} />}
      {editing && <EditDeal license={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
      {removing && <RemoveUser license={removing} onClose={() => setRemoving(null)} onRemove={() => void change({ action: 'remove', id: removing.id })} />}
    </main>
  );
}

/** The free website account: who is signed in, and how to leave. */
function WebsiteAccount() {
  const [email, setEmail] = useState('');
  useEffect(() => { void supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? '')); }, []);
  return (
    <main className="adm">
      <header className="adm-head"><div><h1>Account</h1><p>{email ? `Signed in as ${email}` : ' '}</p></div><button type="button" className="adm-go" onClick={() => void logOut()}>Log out</button></header>
      <p className="adm-note">Bopzi is free. Your e-mail address is stored by our sign-in provider, Supabase, so you can log in. Your projects stay in this browser. Need help or want your account removed? {HELP_TEXT}.</p>
    </main>
  );
}

export default function AccountSettings() {
  if (HOSTED_ACCOUNTS) return <WebsiteAccount />;
  if (currentAdmin) return <AdminPanel />;
  return (
    <main className="adm">
      <header className="adm-head"><div><h1>Account</h1><p>Licensed to {currentUser || 'this computer'}</p></div></header>
      <p className="adm-note">Your license is tied to this computer. Contact the person who gave you your key if you need help.</p>
    </main>
  );
}
