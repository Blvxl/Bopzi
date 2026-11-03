'use client';

import { RisingCard } from '@/components/GameParts';
import { useOverview } from '@/components/useOverview';

/** Games growing faster than the market over the last day. */
export default function Rising() {
  const data = useOverview();
  return (
    <main className="wrap">
      <div className="page-head"><div><h1>Rising</h1><p>Growing faster than the rest of Roblox over the last day. Games under 1,000 players are left out.</p></div></div>
      <div className="r-grid">{data?.rising.map((g) => <RisingCard key={g.id} game={g} />)}</div>
      {data && !data.rising.length && <p className="empty">Climbing games show up once the collector has a few hours of history.</p>}
      {!data && <p className="empty">Loading…</p>}
    </main>
  );
}
