'use client';

import { useEffect, useState } from 'react';
import type { Snapshot } from './ActivityChart';

export type GameCard = { id: number; name: string; creator: string | null; playing: number; icon: string | null };
export type Riser = GameCard & { change: number; pct: number; spark: number[] };
export type Overview = { history: Snapshot[]; total: number; top: GameCard[]; rising: Riser[]; error?: string };

const REFRESH_MS = 30_000;

/** The page's data, refreshed every 30 seconds. `null` until the first answer. */
export function useOverview() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const json = await fetch('/api/terminal', { cache: 'no-store' }).then((r) => r.json());
        if (active) setData({ history: [], total: 0, top: [], rising: [], ...json });
      } catch {
        if (active) setData((old) => ({ history: [], total: 0, top: [], rising: [], ...old, error: 'Could not reach the collection.' }));
      }
    };
    void refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return data;
}
