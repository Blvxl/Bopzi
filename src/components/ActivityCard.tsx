'use client';

import NumberFlow from '@number-flow/react';
import { useCallback, useMemo, useState } from 'react';
import ActivityChart, { pointsFor, type Range, type Scrub, type Snapshot } from './ActivityChart';

const clock = (ts: string, range: Range) => new Date(ts).toLocaleString(undefined, range === '1D' || range === '1W' ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Digits roll with the same ease the chart's cursor uses, so a drag across the chart reads as one motion. */
const ease = { duration: 450, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' };
const roll = { transformTiming: ease, spinTiming: ease, opacityTiming: { duration: 200, easing: 'ease-out' } };

/** The chart card owns the cursor state, so scrubbing redraws only this card and not the games table below it. */
export default function ActivityCard({ history, showRanges = false }: { history: Snapshot[]; showRanges?: boolean }) {
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
  const available = useMemo(() => {
    const span = history.length > 1 ? Date.parse(history[history.length - 1].ts) - Date.parse(history[0].ts) : 0;
    return ([['1D', 864e5], ['1W', 6048e5], ['1M', 2592e6]] as const).filter(([, ms]) => span >= ms).map(([label]) => label);
  }, [history]);

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
      {showRanges && <div className="gc-foot"><div className="gc-seg gc-ranges" role="group" aria-label="Player history range">
        {[...available, 'All' as const].map((item) => <button type="button" key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}
      </div></div>}
      <p className="gc-note">Counts public games. Roblox hides age-restricted games from public data, so this total reads lower than sites that include them.</p>
    </section>
  );
}
