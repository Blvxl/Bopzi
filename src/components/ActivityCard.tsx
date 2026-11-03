'use client';

import NumberFlow from '@number-flow/react';
import { useCallback, useMemo, useState } from 'react';
import ActivityChart, { pointsFor, type Range, type Scrub, type Snapshot } from './ActivityChart';

const LIVE_WITHIN = 12 * 60e3;
const clock = (ts: string, range: Range) => new Date(ts).toLocaleString(undefined, range === '1D' || range === '1W' ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Digits roll with the same ease the chart's cursor uses, so a drag across the chart reads as one motion. */
const ease = { duration: 450, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const roll = { transformTiming: ease, spinTiming: ease, opacityTiming: { duration: 200, easing: 'ease-out' } };

/** The chart card owns the cursor state, so scrubbing redraws only this card and not the games table below it. */
export default function ActivityCard({ history }: { history: Snapshot[] }) {
  const [range, setRange] = useState<Range>('All');
  const [scrub, setScrub] = useState<Scrub | null>(null);
  const latest = history.at(-1);
  const shown = scrub ?? latest;
  // Change since the first snapshot of the chosen range.
  const first = useMemo(() => pointsFor(history, range)[0], [history, range]);
  const change = shown && first && shown.ts !== first.ts ? shown.players - first.players : null;
  const pct = change !== null && first?.players ? Math.abs(change) / first.players : 0;
  const down = change !== null && change < 0;
  const onScrub = useCallback((s: Scrub | null) => setScrub(s), []);
  const live = !!latest && Date.now() - new Date(latest.ts).getTime() < LIVE_WITHIN;

  // The highlight slides under whichever range is active.

  return (
    <section className="gc">
      <h2 className="gc-title">Players online</h2>
      <div className="gc-value">{shown ? <NumberFlow value={shown.players} locales="en-US" format={{ maximumFractionDigits: 0 }} {...roll} /> : '—'}</div>
      <div className="gc-sub">
        {change !== null
          ? <span className={`gc-delta${down ? ' down' : ''}`}>
              <svg viewBox="0 0 10 8" width="9" height="8" aria-hidden="true" style={down ? { transform: 'rotate(180deg)' } : undefined}><path d="M5 0.5 9.5 7.5H0.5Z" fill="currentColor" /></svg>
              <NumberFlow value={Math.abs(change)} locales="en-US" format={{ notation: 'compact', maximumFractionDigits: 2 }} {...roll} />
              <NumberFlow value={pct} locales="en-US" prefix="(" suffix=")" format={{ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }} {...roll} />
            </span>
          : null}
        {shown && <span className="gc-when">{clock(shown.ts, range)}{scrub?.estimated ? ' · est.' : ''}</span>}
      </div>
      <ActivityChart history={history} range={range} onScrub={onScrub} />
    </section>
  );
}
