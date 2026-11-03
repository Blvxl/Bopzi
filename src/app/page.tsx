'use client';

import Link from 'next/link';
import ActivityCard from '@/components/ActivityCard';
import { GameRow, RisingCard } from '@/components/GameParts';
import { useOverview } from '@/components/useOverview';

function Head({ title, href, note }: { title: string; href?: string; note?: string }) {
  return (
    <div className="sec-head">
      <div><h2>{title}</h2>{note && <p>{note}</p>}</div>
      {href && <Link href={href}>See all</Link>}
    </div>
  );
}

/** Overview: the player chart across the top, then what is climbing and what is busiest. */
export default function Home() {
  const data = useOverview();
  const top = data?.top.slice(0, 10) ?? [];
  const rising = data?.rising.slice(0, 8) ?? [];
  return (
    <main className="wrap">
      <section className="hero"><ActivityCard history={data?.history ?? []} /></section>

      <section className="sec">
        <Head title="Rising now" href="/rising" note="Growing faster than the rest of Roblox over the last day" />
        {rising.length
          ? <div className="r-row">{rising.map((g) => <RisingCard key={g.id} game={g} />)}</div>
          : <p className="empty">{data ? 'Climbing games show up once the collector has a few hours of history.' : 'Loading…'}</p>}
      </section>

      <section className="sec">
        <Head title="Busiest right now" href="/games" note="Most players at the last collection" />
        <div className="g-list">
          {top.map((g, i) => <GameRow key={g.id} game={g} rank={i + 1} max={top[0]?.playing ?? 1} />)}
          {!top.length && <p className="empty">{data ? 'No games yet.' : 'Loading…'}</p>}
        </div>
      </section>

      {data?.error && <p className="empty" role="status">{data.error}</p>}
      <footer className="foot">Independent. Not affiliated with Roblox. Player counts cover the games Bopzi tracks, not every game on Roblox.</footer>
    </main>
  );
}
