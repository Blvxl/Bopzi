'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { linkSeries, type TotalRow } from '@/lib/series';
import { PUBLISHED, published } from '@/lib/source';
import type { Snapshot } from './ActivityChart';

export type GameCard = { id: number; name: string; creator: string | null; playing: number; icon: string | null };
export type Riser = GameCard & { change: number; pct: number; spark: number[] };
export type Stats = { peak: number; low: number; average: number; points: number; games: number };
export type Visited = GameCard & { visits: number; favorites: number | null };
export type Fresh = GameCard & { created: string };
export type PulseEvent = { id: number; ts: string; kind: 'milestone' | 'new_high' | 'update' | 'new_game' | 'surge' | 'forecast' | 'comeback' | 'crash' | 'impact' | 'hands'; value: number | null; prev: number | null; detail: string | null; game: { id: number; name: string; genre: string | null; place: number | null; icon: string | null } };
export type Overview = { history: Snapshot[]; total: number; stats: Stats | null; top: GameCard[]; rising: Riser[]; visited: Visited[]; fresh: Fresh[]; pulse: PulseEvent[]; error?: string };

/** What the data route sends: the same, but with the raw totals (the page chains them) and the history already chained. */
type Loaded = Omit<Overview, 'history' | 'total'> & { totals: TotalRow[] };

const EMPTY: Loaded = { totals: [], stats: null, top: [], rising: [], visited: [], fresh: [], pulse: [] };
/** Everything except the live total and the feed is refreshed this often; those two arrive the moment they exist. */
const REFRESH_MS = PUBLISHED ? 15_000 : 60_000;
/** The feed is shown one event at a time, about this far apart, so a batch from the collector reads like something happening. */
const DRIP_MS = 3_000;
const DRIP_MIN_MS = 1_200;
/** A big batch is sped up a little so that it never takes much longer than this to play out. */
const DRIP_MAX_TOTAL_MS = 75_000;

/**
 * The page's data. It is fetched once, then kept current by a live connection: each new total and each new feed event is
 * pushed as it is saved, so the page can glide them in instead of swapping everything every half minute.
 * `null` until the first answer.
 */
export function useOverview(pulseLimit = 40) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [liveTotals, setLiveTotals] = useState<TotalRow[]>([]);
  const [feed, setFeed] = useState<PulseEvent[] | null>(null);
  const [error, setError] = useState('');

  // Events do not appear all at once. The collector saves a handful every few minutes; each one waits its turn and slides in about
  // a second after the one before, like lines arriving in a terminal. The first load is shown straight away.
  const queue = useRef<PulseEvent[]>([]);
  const known = useRef(new Set<number>());
  const dripping = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const limit = useRef(pulseLimit);
  useEffect(() => { limit.current = pulseLimit; }, [pulseLimit]);
  const newestFirst = (list: PulseEvent[]) => list.sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id).slice(0, limit.current);
  const next = useCallback(() => {
    const e = queue.current.shift();
    if (!e) { dripping.current = false; return; }
    setFeed((old) => newestFirst([e, ...(old ?? [])]));
    if (!queue.current.length) { dripping.current = false; return; }
    const pace = Math.min(DRIP_MS, Math.max(DRIP_MIN_MS, DRIP_MAX_TOTAL_MS / (queue.current.length + 1)));
    timer.current = setTimeout(next, pace * (0.9 + Math.random() * 0.2));
  }, []);
  const arrive = useCallback((events: PulseEvent[], instant = false) => {
    const fresh = events.filter((e) => !known.current.has(e.id));
    if (!fresh.length) return;
    fresh.forEach((e) => known.current.add(e.id));
    if (instant) { setFeed((old) => newestFirst([...fresh, ...(old ?? [])])); return; }
    queue.current.push(...fresh);
    queue.current.sort((a, b) => a.ts.localeCompare(b.ts) || a.id - b.id); // oldest first, so the newest lands on top
    if (!dripping.current) { dripping.current = true; next(); }
  }, [next]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The full picture, now and every minute.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const json = await fetch(PUBLISHED ? published('overview.json') : `/api/terminal?pulse=${pulseLimit}`, { cache: 'no-store' }).then((r) => r.json());
        if (!active) return;
        setLoaded({ ...EMPTY, ...json });
        // The first answer fills the feed at once; later ones add only what is new, one at a time.
        const first = known.current.size === 0 && queue.current.length === 0;
        arrive((json.pulse ?? []).slice(0, pulseLimit), first);
        setError(json.error ?? '');
      } catch {
        if (active) setError('Could not reach the collection.');
      }
    };
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [pulseLimit, arrive]);

  // The live connection, opened once there is something to continue from.
  const ready = !!loaded;
  const startTs = loaded?.totals.at(-1)?.ts ?? '';
  const startEvent = loaded?.pulse.length ? Math.max(...loaded.pulse.map((p) => p.id)) : 0;
  useEffect(() => {
    // The public site has no live connection to open: it asks for the published files every few seconds instead.
    if (!ready || PUBLISHED || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/stream?since=${encodeURIComponent(startTs)}&event=${startEvent}`);
    source.addEventListener('live', (e) => setLiveTotals((old) => [...old, JSON.parse((e as MessageEvent).data) as TotalRow]));
    source.addEventListener('pulse', (e) => arrive(JSON.parse((e as MessageEvent).data) as PulseEvent[]));
    return () => source.close();
    // Opened once; a reconnect by the browser continues from the same point and repeats are dropped when merging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // The chart's series is rebuilt only when a total arrives, not when a feed event does.
  const history = useMemo(() => {
    if (!loaded) return null;
    const seen = new Set(loaded.totals.map((t) => t.ts));
    return linkSeries([...loaded.totals, ...liveTotals.filter((t) => !seen.has(t.ts))].sort((a, b) => a.ts.localeCompare(b.ts)));
  }, [loaded?.totals, liveTotals]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo<Overview | null>(() => {
    if (!loaded || !history) return null;
    return { ...loaded, history, total: history.at(-1)?.players ?? 0, pulse: feed ?? [], error: error || undefined };
  }, [loaded, history, feed, error]);
}
