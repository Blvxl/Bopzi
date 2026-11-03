'use client';

import { useOverview } from '@/components/useOverview';
import { GameRow } from '@/components/GameParts';

export default function Live() {
  const data = useOverview();
  const latest = data?.history.at(-1);
  return <main className="wrap">
    <div className="page-head"><div><p className="live-kicker"><i /> LIVE TERMINAL</p><h1>Live</h1><p>Player counts from the latest Roblox collection.</p></div></div>
    <section className="live-summary">
      <div><span>PLAYERS ONLINE IN TRACKED GAMES</span><strong>{data?.total ? new Intl.NumberFormat('en-US').format(data.total) : '—'}</strong></div>
      <div><span>GAMES TRACKED</span><strong>{latest ? new Intl.NumberFormat('en-US').format(latest.games) : '—'}</strong></div>
      <div><span>LAST COLLECTION</span><strong>{latest ? new Date(latest.ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : 'Waiting'}</strong></div>
    </section>
    <h2 className="live-subhead">Playing now</h2>
    <div className="g-list">{(data?.top ?? []).map((game,i)=><GameRow key={game.id} game={game} rank={i+1} max={data?.top[0]?.playing ?? 1}/>)}{!data?.top.length&&<p className="empty">{data ? 'Waiting for the next collection.' : 'Loading live counts…'}</p>}</div>
  </main>;
}
