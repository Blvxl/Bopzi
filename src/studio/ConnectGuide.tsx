'use client';

import { Check, Copy, Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Link } from './imageRoute';

type Step = { title: string; body: React.ReactNode; state: 'done' | 'now' | 'later' | 'info' };

/**
 * Walks someone through using their own ChatGPT plan. Each step that can be checked is checked for real,
 * again every few seconds, so the list ticks itself off as they go.
 */
export default function ConnectGuide({ link, onCheck, onClose }: { link: Link; onCheck: () => Promise<unknown>; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // A denied permission is not asked again by polling, and the request itself would only fail.
    if (link.connected || link.permission === 'denied') return;
    const timer = setInterval(() => void onCheck(), 3000);
    return () => clearInterval(timer);
  }, [link.connected, link.permission, onCheck]);
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

  const check = async () => {
    setChecking(true);
    try {
      await onCheck();
    } finally {
      setChecking(false);
    }
  };
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
        {copied === command ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </span>
  );
  const [opened, setOpened] = useState(false);
  const signIn = async () => {
    setOpened(true);
    const done = await fetch('/api/thumbnail/session', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ action: 'login' }) }).then((r) => r.json() as Promise<{ url?: string }>).catch(() => ({ url: '' }));
    if (done.url) window.open(done.url, '_blank', 'noreferrer');
  };
  const viaHelper = link.via === 'helper';
  const blocked = viaHelper && link.permission === 'denied';
  const codexReady = link.connected;
  // What Codex itself reports only arrives once something on this computer can be asked.
  const codexKnown = !viaHelper || link.helperUp;

  const steps: Step[] = [
    {
      title: 'A paid ChatGPT plan',
      state: 'info',
      body: 'Images are made on your own plan and count against its usage. Image generation is not part of the Free plan.',
    },
  ];
  if (viaHelper) {
    steps.push({
      title: 'Start the Bopzi helper',
      state: link.helperUp ? 'done' : blocked ? 'later' : 'now',
      body: (
        <>
          A small program that runs on your computer and passes requests from this page to your Codex app. It needs{' '}
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">
            Node.js
          </a>
          .
          <span className="cg-actions">
            <a className="cg-button" href="/bopzi-helper.mjs" download="bopzi-helper.mjs">
              <Download size={14} /> Download the helper
            </a>
          </span>
          Then open a terminal in the folder you saved it to and run:
          {code('node bopzi-helper.mjs')}
          Keep that window open while you use Bopzi. The helper only answers this site and never reads your ChatGPT sign-in.
        </>
      ),
    });
    steps.push({
      title: 'Let this page reach it',
      state: blocked ? 'now' : link.helperUp ? 'done' : 'later',
      body: blocked ? (
        <>
          Your browser is set to block this site from reaching programs on your computer. Click the icon at the left of the address bar, open the site settings, and set <b>Local network access</b> (Chrome may call it <b>Apps on device</b>) to <b>Allow</b>. Then check again.
        </>
      ) : link.permission === 'prompt' ? (
        <>
          Your browser will ask whether this site may connect to apps on your device. Choose <b>Allow</b>. Bopzi only uses it to talk to the helper.
        </>
      ) : (
        'Some browsers ask whether this site may connect to apps on your device. If yours does, choose Allow.'
      ),
    });
  }
  const missing = /not installed|not found/i.test(link.reason);
  steps.push({
    title: 'Codex, signed in',
    state: codexReady ? 'done' : codexKnown ? 'now' : 'later',
    body: (
      <>
        {missing ? <>Install Codex from a terminal, then start it and choose <b>Sign in with ChatGPT</b>:{code('npm install -g @openai/codex')}{code('codex')}</> : <>
          Sign in on OpenAI&apos;s page. Bopzi never sees your password.
          <span className="cg-actions"><button type="button" className="cg-button" onClick={() => void signIn()}>Sign in with ChatGPT</button></span>
          {opened && 'Finish in your browser. This list updates by itself.'}
        </>}
      </>
    ),
  });

  return (
    <div className="cg-overlay" role="dialog" aria-modal="true" aria-label="Use your own ChatGPT plan" onClick={onClose}>
      <div className="cg" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{link.connected ? 'Your ChatGPT plan is connected' : 'Use your own ChatGPT plan'}</h2>
            <p>{link.connected ? 'You can generate now.' : 'Bopzi makes images through Codex on your computer, so they count against your own plan. Nothing is paid to Bopzi.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <p className="cg-warning">
          <b>Experimental and unofficial.</b> This is not an OpenAI-approved way to make images. It can stop working at any time, and OpenAI could limit or suspend your ChatGPT account. Use it at your own risk.
        </p>
        <ol>
          {steps.map((step, i) => (
            <li key={step.title} className={`is-${step.state}`}>
              <span className="cg-mark" aria-hidden="true">
                {step.state === 'done' ? <Check size={13} /> : i + 1}
              </span>
              <div>
                <h3>
                  {step.title}
                  {step.state === 'done' && <small>Done</small>}
                </h3>
                {step.state !== 'done' && <div className="cg-body">{step.body}</div>}
              </div>
            </li>
          ))}
        </ol>
        <footer>
          {link.connected ? (
            <button type="button" className="cg-button is-go" onClick={onClose}>
              Start generating
            </button>
          ) : (
            <button type="button" className="cg-button" disabled={checking} onClick={() => void check()}>
              <RefreshCw size={13} /> {checking ? 'Checking' : 'Check again'}
            </button>
          )}
          {!link.connected && <button type="button" className="cg-skip" onClick={onClose}>Continue without AI</button>}
          <span>{link.connected ? '' : blocked ? 'Waiting for you to allow access.' : 'The manual tools work without any of this.'}</span>
          <small>This route is not officially supported by OpenAI for other apps and may stop working when Codex changes.</small>
        </footer>
      </div>
    </div>
  );
}
