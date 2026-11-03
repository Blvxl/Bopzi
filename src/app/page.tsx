'use client';

import ActivityCard from '@/components/ActivityCard';
import Pulse from '@/components/Pulse';
import { useOverview } from '@/components/useOverview';
import { RisingCard } from '@/components/GameParts';
import Link from 'next/link';

/** Overview: the player chart, with the live feed of what is happening beside it. */
export default function Home() {
  const data = useOverview();
  // The feed is "live" while the collector keeps saving totals.
  const last = data?.history.at(-1);
  const live = !!last && Date.now() - new Date(last.ts).getTime() < 12 * 60e3;
  return (
    <main className="wrap">
      <section className="hero hero-grid">
        <ActivityCard history={data?.history ?? []} />
        <Pulse events={data?.pulse ?? []} live={live} limit={40} />
      </section>
      <section className="sec" aria-labelledby="rising-heading">
        <div className="sec-head">
          <h2 id="rising-heading">Rising games</h2>
          <Link href="/rising">See all</Link>
        </div>
        {data?.rising.length ? <div className="overview-rising">{data.rising.slice(0, 3).map((game) => <RisingCard key={game.id} game={game} />)}</div>
          : <p className="empty">{data ? 'Rising games appear when enough player history is available.' : 'Loading rising games…'}</p>}
      </section>
    </main>
  );
}
