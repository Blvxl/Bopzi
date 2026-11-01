'use client';

import { ArrowLeft, Check, Copy, Download, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Link } from './imageRoute';

type Card = {
  id: string;
  title: string;
  /** One short line under the title. */
  lead: React.ReactNode;
  /** The things to do, as short numbered lines. */
  todo?: React.ReactNode[];
  action?: React.ReactNode;
  /** A card that checks itself shows what it is waiting for and moves on alone. */
  waiting?: string;
  /** Checks that tick themselves off, shown in place of a plain waiting line. */
  live?: { label: string; state: 'done' | 'now' | 'later' }[];
  problem?: React.ReactNode;
  done: boolean;
  manual: boolean;
};

/** The wait itself: a pulse, what is being waited for, how long, and a nudge when it takes too long. */
function Waiting({ title, hint }: { title: string; hint?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="cg-wait" role="status" aria-live="polite">
      <span className="cg-pulse" aria-hidden="true"><i /><i /></span>
      <div>
        <b>{title}</b>
        <small>{seconds >= 45 ? 'Still nothing? Look at the black window for a red message.' : hint ?? 'This page checks for you every few seconds.'}</small>
      </div>
      <time aria-label={`${seconds} seconds`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time>
    </div>
  );
}

/** Steps that tick themselves off: done, happening now, or still to come. */
function Live({ rows }: { rows: { label: string; state: 'done' | 'now' | 'later' }[] }) {
  return (
    <ul className="cg-live" role="status" aria-live="polite">
      {rows.map((row) => (
        <li key={row.label} className={`is-${row.state}`}>
          <span aria-hidden="true">{row.state === 'done' ? <Check size={13} /> : row.state === 'now' ? <i /> : null}</span>
          {row.label}
        </li>
      ))}
    </ul>
  );
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Walks someone through using their own ChatGPT plan, one card at a time. Cards that can be checked for real
 * (the helper is running, Codex is signed in) move on by themselves; the rest wait for "Done".
 */
export default function ConnectGuide({ link, onCheck, onClose }: { link: Link; onCheck: () => Promise<unknown>; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const [started, setStarted] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [cursor, setCursor] = useState<number | null>(null);
  const [opened, setOpened] = useState(false);
  const [sawOutdated, setSawOutdated] = useState(false);

  useEffect(() => {
    // Keeps asking even while the browser blocks the page, so it notices the moment someone clicks Allow.
    if (link.connected) return;
    const timer = setInterval(() => void onCheck(), 3000);
    return () => clearInterval(timer);
  }, [link.connected, onCheck]);
  useEffect(() => { if (link.helperOutdated) setSawOutdated(true); }, [link.helperOutdated]);
  // Once the helper has been seen, the welcome card never comes back, even while the helper is restarted.
  useEffect(() => { if (link.helperUp || link.connected) setStarted(true); }, [link.helperUp, link.connected]);
  // Once the helper has answered, the first three questions stay answered, even while it is restarted.
  useEffect(() => { if (link.helperUp || link.connected) setConfirmed((c) => ({ ...c, plan: true, node: true, file: true })); }, [link.helperUp, link.connected]);
  // When the helper or Codex answers, the guide follows by itself even if someone had stepped back.
  useEffect(() => { setCursor(null); }, [link.helperUp, link.connected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      /* the command is on screen to type */
    }
  };
  const code = (command: string) => (
    <span className="cg-code">
      <code>{command}</code>
      <button type="button" onClick={() => void copy(command)} aria-label={`Copy ${command}`}>
        {copied === command ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </span>
  );
  const signIn = async () => {
    setOpened(true);
    const done = await fetch('/api/thumbnail/session', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ action: 'login' }) }).then((r) => r.json() as Promise<{ url?: string }>).catch(() => ({}) as { url?: string });
    if (done.url) window.open(done.url, '_blank', 'noreferrer');
  };

  const viaHelper = link.via === 'helper';
  const blocked = viaHelper && link.permission === 'denied';
  const mac = isMac();
  const missing = /not installed|not found/i.test(link.reason);
  // Once something later has worked, the earlier "did you do this?" cards no longer matter.
  const later = link.helperUp || link.connected;
  const ok = (id: string) => !!confirmed[id] || later;
  const confirm = (id: string) => { setConfirmed((c) => ({ ...c, [id]: true })); setCursor(null); };

  const next = (id: string, label = 'Done, next') => (
    <button type="button" className="cg-button is-go" onClick={() => confirm(id)}>{label}</button>
  );

  const cards: Card[] = [];
  cards.push({
    id: 'plan',
    title: 'Do you have a paid ChatGPT plan?',
    lead: 'AI images use your own ChatGPT account. Plus, Pro or Team works. The Free plan cannot make images.',
    action: (
      <>
        {next('plan', 'Yes, I have one')}
        <a className="cg-button" href="https://chatgpt.com/#pricing" target="_blank" rel="noreferrer">I need one <ExternalLink size={13} /></a>
      </>
    ),
    done: ok('plan'),
    manual: true,
  });
  if (viaHelper) {
    cards.push({
      id: 'node',
      title: 'Install Node.js',
      lead: 'A free program the helper needs. It takes about two minutes.',
      todo: [
        <>Click <b>Get Node.js</b> and download the version marked <b>LTS</b>.</>,
        <>Open the file and click <b>Next</b> until it finishes.</>,
      ],
      action: (
        <>
          <a className="cg-button" href="https://nodejs.org" target="_blank" rel="noreferrer">Get Node.js <ExternalLink size={13} /></a>
          {next('node', 'Installed, next')}
          <button type="button" className="cg-skip" onClick={() => confirm('node')}>I already have it</button>
        </>
      ),
      done: ok('node'),
      manual: true,
    });
    cards.push({
      id: 'file',
      title: 'Download the helper',
      lead: 'A small file that lets this page use your ChatGPT plan.',
      todo: [<>Click <b>Download</b>. Keep the file in your <b>Downloads</b> folder.</>],
      action: (
        <>
          <a className="cg-button" href="/bopzi-helper.mjs" download="bopzi-helper.mjs"><Download size={14} /> Download the helper</a>
          {next('file', 'I have it, next')}
        </>
      ),
      done: ok('file'),
      manual: true,
    });
    const command = mac ? 'node ~/Downloads/bopzi-helper.mjs' : 'node "%USERPROFILE%\\Downloads\\bopzi-helper.mjs"';
    if (link.helperOutdated || (sawOutdated && !link.connected)) {
      const upToDate = link.helperUp && !link.helperOutdated;
      const closed = !link.helperUp;
      cards.push({
        id: 'update',
        title: 'Update the helper',
        lead: 'There is a newer helper. This takes a minute.',
        todo: [
          <>Get the new file. Save it over the old one.<span className="cg-inline"><a className="cg-button is-go" href="/bopzi-helper.mjs" download="bopzi-helper.mjs"><Download size={14} /> Download the new helper</a></span></>,
          <>Close the old black window (click its <b>X</b>).</>,
          mac
            ? <>Open <b>Terminal</b> again (<b>⌘ Space</b>, type <b>Terminal</b>, <b>Enter</b>) and paste this:{code(command)}</>
            : <>Open a new black window (<b>Windows key</b>, type <b>cmd</b>, <b>Enter</b>) and paste this:{code(command)}</>,
        ],
        live: [
          { label: 'Old helper closed', state: closed || upToDate ? 'done' : 'now' },
          { label: 'New helper running', state: upToDate ? 'done' : closed ? 'now' : 'later' },
        ],
        done: upToDate || !!link.connected,
        manual: false,
      });
    }
    cards.push({
      id: 'run',
      title: 'Start the helper',
      lead: 'This page finds it by itself. Nothing to click afterwards.',
      todo: mac
        ? [<>Press <b>⌘ Space</b>, type <b>Terminal</b>, press <b>Enter</b>.</>, <>Paste this and press <b>Enter</b>:{code(command)}</>, <>Leave that window open while you use Bopzi.</>]
        : [<>Press the <b>Windows key</b>, type <b>cmd</b>, press <b>Enter</b>.</>, <>Paste this and press <b>Enter</b>:{code(command)}</>, <>Leave the black window open while you use Bopzi.</>],
      waiting: blocked ? undefined : link.permission === 'prompt' ? 'Waiting for the helper. If your browser asks, click Allow.' : 'Waiting for the helper to start',
      problem: blocked ? (
        <>Your browser is blocking this page. Click the <b>icon left of the address bar</b>, open <b>Site settings</b>, and set <b>Local network access</b> (or <b>Apps on device</b>) to <b>Allow</b>. Then it continues by itself, or <button type="button" className="cg-link" onClick={() => void onCheck()}>check again now</button>.</>
      ) : (
        <>It says <b>&quot;node&quot; is not recognized</b>? <button type="button" className="cg-link" onClick={() => { setConfirmed((c) => ({ ...c, node: false })); setCursor(1); }}>Go back and install Node.js</button>.</>
      ),
      done: (link.helperUp && !link.helperOutdated) || link.connected,
      manual: false,
    });
  }
  cards.push({
    id: 'codex',
    title: viaHelper && !missing ? 'Sign in to Codex' : missing ? 'Install Codex' : 'Sign in with ChatGPT',
    lead: missing ? 'Codex is OpenAI’s app. It makes the images on your plan.' : 'Bopzi never sees your password. You sign in on OpenAI’s page.',
    todo: missing
      ? [<>Open the same black window again and paste:{code('npm install -g @openai/codex')}</>, <>Then paste this, and choose <b>Sign in with ChatGPT</b>:{code('codex')}</>]
      : viaHelper
        ? [<>In the black window (open a new one if you closed it), paste this and choose <b>Sign in with ChatGPT</b>:{code('codex')}</>]
        : undefined,
    action: !viaHelper && !missing ? (
      <>
        <button type="button" className="cg-button is-go" onClick={() => void signIn()}>Sign in with ChatGPT</button>
        {opened && <span className="cg-hint">Finish in your browser, then come back.</span>}
      </>
    ) : undefined,
    waiting: 'Waiting for you to sign in',
    done: link.connected,
    manual: false,
  });

  const total = cards.length;
  const firstOpen = cards.findIndex((c) => !c.done);
  const index = link.connected ? total : cursor ?? (firstOpen === -1 ? total : firstOpen);
  const showIntro = !started && !later;
  const card = cards[index];

  return (
    <div className="cg-overlay" role="dialog" aria-modal="true" aria-label="Use your own ChatGPT plan" onClick={onClose}>
      <div className="cg" onClick={(e) => e.stopPropagation()}>
        <header>
          {!showIntro && !link.connected && card && (
            <div className="cg-progress" aria-label={`Step ${index + 1} of ${total}`}>
              {cards.map((c, i) => <span key={c.id} className={i < index || c.done ? 'is-done' : i === index ? 'is-now' : ''} />)}
              <small>Step {index + 1} of {total}</small>
            </div>
          )}
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {showIntro ? (
          <div className="cg-card">
            <h2>Make images with your own ChatGPT plan</h2>
            <p className="cg-lead">One-time setup, about 10 minutes. We check each step for you. The editor works without it.</p>
            <p className="cg-warning"><b>Unofficial.</b> This is not an OpenAI-approved way to make images. It could stop working, so use it at your own risk.</p>
            <div className="cg-actions">
              <button type="button" className="cg-button is-go" onClick={() => setStarted(true)}>Start</button>
              <button type="button" className="cg-skip" onClick={onClose}>Use Bopzi without AI</button>
            </div>
          </div>
        ) : link.connected || !card ? (
          <div className="cg-card is-success">
            <span className="cg-big-check" aria-hidden="true"><Check size={26} /></span>
            <h2>You&apos;re all set</h2>
            <p className="cg-lead">Your ChatGPT plan is connected. Images you make count against it.</p>
            <div className="cg-actions"><button type="button" className="cg-button is-go" onClick={onClose}>Start generating</button></div>
          </div>
        ) : (
          <div className="cg-card" key={card.id}>
            <h2>{card.title}</h2>
            <p className="cg-lead">{card.lead}</p>
            {card.todo && <ol className="cg-todo">{card.todo.map((line, i) => <li key={i}><span>{i + 1}</span><div>{line}</div></li>)}</ol>}
            {card.action && <div className="cg-actions">{card.action}</div>}
            {card.live && <Live rows={card.live} />}
            {card.problem && <p className={blocked && card.id === 'run' ? 'cg-warning' : 'cg-help'}>{card.problem}</p>}
            {card.waiting && <Waiting title={card.waiting} hint={card.id === 'run' && link.permission === 'prompt' ? 'If your browser asks, click Allow.' : undefined} />}
            <div className="cg-nav">
              {index > 0 ? <button type="button" className="cg-skip" onClick={() => setCursor(index - 1)}><ArrowLeft size={13} /> Back</button> : <span />}
              <button type="button" className="cg-skip" onClick={onClose}>Use Bopzi without AI</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
