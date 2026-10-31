'use client';

import { ArrowUpRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Account = { name: string; email: string; plan: string };
type Status = { connected: boolean; reason?: string; account?: Account | null };

/** Asked once a page, however many bars show the button; opening the menu asks again. */
let asked: Promise<Status> | null = null;
const status = (fresh = false) => {
  if (!asked || fresh) asked = fetch('/api/thumbnail', { cache: 'no-store' }).then((r) => r.json() as Promise<Status>).catch(() => ({ connected: false }));
  return asked;
};

const PLANS: Record<string, string> = { free: 'Free', go: 'Go', plus: 'Plus', pro: 'Pro', team: 'Team', business: 'Business', enterprise: 'Enterprise', edu: 'Edu' };

/** The picture set in ChatGPT, or the first letter when there is none. */
function Avatar({ name, large }: { name: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`account-avatar${large ? ' is-large' : ''}`} aria-hidden="true">
      {name[0]?.toUpperCase()}
      {!broken && <img src="/api/thumbnail/account" alt="" onError={() => setBroken(true)} />}
    </span>
  );
}

/** Who Bopzi is signed in as: the ChatGPT account Codex uses. There is no Bopzi account behind it. */
export default function AccountMenu() {
  const path = usePathname() ?? '/';
  const [state, setState] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { let alive = true; void status().then((s) => { if (alive) setState(s); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void status(true).then((s) => { if (alive) setState(s); });
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => { alive = false; window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); };
  }, [open]);

  const account = state?.connected ? state.account : null;
  const label = account?.name || account?.email || '';
  const plan = account && (PLANS[account.plan] ?? account.plan);
  const free = account?.plan === 'free';
  // In the studio the guide opens over the work; anywhere else it opens there.
  const setup = (e: React.MouseEvent) => {
    setOpen(false);
    if (!path.startsWith('/studio')) return;
    e.preventDefault();
    window.dispatchEvent(new Event('bopzi:connect'));
  };

  return (
    <div className="account" ref={box}>
      {state && !state.connected
        ? <button type="button" className="account-connect" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>Connect</button>
        : <button type="button" className="account-button" aria-label={account ? `Account: ${label}` : 'Account'} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
            {label ? <Avatar name={label} /> : <span className="account-avatar is-empty" aria-hidden="true" />}
          </button>}
      {open && <div className="account-pop" role="dialog" aria-label="Account">
        {account ? <>
          <div className="account-who">
            <Avatar name={label} large />
            <p><b>{account.name || account.email}</b>{account.name && <small>{account.email}</small>}</p>
          </div>
          <hr />
          <p className="account-row"><span>Plan</span><b><i className={free ? 'is-warn' : undefined} />{plan ? `ChatGPT ${plan}` : 'ChatGPT'}</b></p>
          <a className="account-row is-link" href="https://chatgpt.com/#settings/Account" target="_blank" rel="noreferrer"><span>Manage plan</span><ArrowUpRight size={15} aria-hidden="true" /></a>
          <hr />
          <p className="account-foot">{free ? 'AI images need a paid plan. Manual tools still work.' : 'Images count against this plan.'}</p>
        </> : state && !state.connected ? <div className="account-off">
          <b>Not connected</b>
          <p>{state.reason || 'No ChatGPT plan is connected.'}</p>
          <a href="/studio?connect=1" onClick={setup}>Connect ChatGPT</a>
        </div> : <p className="account-foot">{state ? 'Connected. Your account details could not be read.' : 'Checking your account…'}</p>}
      </div>}
    </div>
  );
}
