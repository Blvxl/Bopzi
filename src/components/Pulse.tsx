'use client';

import { ArrowUpRight, Crown, Flag, RefreshCw, Rocket, Sparkles, TrendingDown, TrendingUp, Undo2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PulseEvent } from './useOverview';

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);

function ago(ts: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const BADGE = {
  milestone: { Icon: Flag, cls: 'b-milestone', label: 'Milestone' },
  new_high: { Icon: Crown, cls: 'b-high', label: 'New high' },
  update: { Icon: RefreshCw, cls: 'b-update', label: 'Update' },
  new_game: { Icon: Sparkles, cls: 'b-new', label: 'New game' },
  surge: { Icon: Zap, cls: 'b-surge', label: 'Rising fast' },
  forecast: { Icon: TrendingUp, cls: 'b-forecast', label: 'Forecast' },
  comeback: { Icon: Undo2, cls: 'b-comeback', label: 'Comeback' },
  crash: { Icon: TrendingDown, cls: 'b-crash', label: 'Crash alert' },
  impact: { Icon: Rocket, cls: 'b-impact', label: 'Update impact' },
} as const;

function Line({ e }: { e: PulseEvent }) {
  const name = <b>{e.game.name}</b>;
  const num = e.value != null ? <em>{compact(e.value)}</em> : null;
  switch (e.kind) {
    case 'milestone': return <>{name} passed {num} playing</>;
    case 'new_high': return <>{name} hit {num}, its best yet{e.prev ? <> (was {compact(e.prev)})</> : null}</>;
    case 'update': return <>{name} just pushed an update</>;
    case 'surge': return <>{name} just gained <em>+{compact(e.value ?? 0)}</em> players in {e.detail ?? '10'} minutes</>;
    case 'forecast': return <>{name} is on pace to hit {num} in about {e.detail} minutes</>;
    case 'comeback': return <>{name} is back: {num} playing, it was under {compact(e.prev ?? 0)} yesterday</>;
    case 'crash': return <>{name} lost <em className="neg">{e.value}%</em> of its players in {e.detail} minutes</>;
    case 'impact': return (e.value ?? 0) >= 0
      ? <>An update brought <em>+{compact(e.value ?? 0)}</em>{e.detail ? <> (+{Number(e.detail).toLocaleString('en-US')}%)</> : null} players to {name}</>
      : <>An update cost {name} <em className="neg">{compact(Math.abs(e.value ?? 0))}</em>{e.detail ? <> ({Number(e.detail).toLocaleString('en-US')}%)</> : null} players</>;
    case 'new_game': return <>{name} is new and already at {num}</>;
  }
}

/** What just happened on Roblox: games passing round numbers, beating their best, updating or arriving busy. */
export default function Pulse({ events, live, limit, all = false }: { events: PulseEvent[]; live: boolean; limit?: number; all?: boolean }) {
  // The "2m ago" labels keep counting between refreshes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const shown = limit ? events.slice(0, limit) : events;

  // New rows drop in from the top with a soft yellow flash, and the rows already there glide down to make room (a FLIP animation),
  // so a refresh never swaps the list in one jump. The first load just fades the rows in one after another.
  const rows = useRef(new Map<number, HTMLLIElement>());
  const tops = useRef(new Map<number, number>());
  const firstPaint = useRef(true);
  useLayoutEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<number, number>();
    shown.forEach((e, i) => {
      const el = rows.current.get(e.id);
      if (!el) return;
      const top = el.offsetTop;
      next.set(e.id, top);
      if (calm) return;
      const before = tops.current.get(e.id);
      const slow = 'cubic-bezier(.32,.72,0,1)';
      if (firstPaint.current) {
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: i * 45, easing: slow, fill: 'backwards' });
      } else if (before === undefined) {
        // A new row drops in with a soft yellow flash, its line is revealed from the left as if it were being written,
        // and the small print fades in just after.
        el.animate([{ opacity: 0, transform: 'translateY(-18px)', backgroundColor: 'rgba(255,214,10,.16)' }, { opacity: 1, transform: 'none', backgroundColor: 'rgba(255,214,10,0)' }], { duration: 750, easing: slow });
        el.querySelector('.pulse-line')?.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 750, delay: 180, easing: slow, fill: 'backwards' });
        el.querySelector('.pulse-sub')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 500, easing: 'ease-out', fill: 'backwards' });
      } else if (before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], { duration: 650, easing: slow });
      }
    });
    tops.current = next;
    if (shown.length) firstPaint.current = false;
  });
  return (
    <section className={`pulse${all ? ' pulse-all' : ''}`} aria-label="Live activity">
      <div className="pulse-head">
        <h2>Live {live && <i className="pulse-dot" aria-label="Live" />}</h2>
        {!all && <Link href="/pulse">See all</Link>}
      </div>
      <ul className="pulse-list">
        {shown.map((e) => {
          const { Icon, cls, label } = BADGE[e.kind];
          return (
            <li key={e.id} className="pulse-item" ref={(el) => { if (el) rows.current.set(e.id, el); else rows.current.delete(e.id); }}>
              <span className="pulse-art">
                {e.game.icon ? <img src={e.game.icon} alt="" width={56} height={56} loading="lazy" /> : <span className="pulse-initial">{e.game.name.charAt(0).toUpperCase()}</span>}
                <span className={`pulse-badge ${cls}`} title={label}><Icon size={13} strokeWidth={2.4} aria-hidden="true" /></span>
              </span>
              <span className="pulse-text">
                <span className="pulse-line"><Line e={e} /></span>
                <span className="pulse-sub">
                  {e.game.place ? <><a href={`https://www.roblox.com/games/${e.game.place}`} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}>Open game <ArrowUpRight size={12} strokeWidth={2.4} aria-hidden="true" /></a> · </> : null}{ago(e.ts, now)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="pulse-empty">Nothing yet. Events appear as the collector sees games move.</p>}
    </section>
  );
}
