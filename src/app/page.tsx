'use client';

import ActivityCard from '@/components/ActivityCard';
import Pulse from '@/components/Pulse';
import { useOverview } from '@/components/useOverview';

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
    </main>
  );
}
