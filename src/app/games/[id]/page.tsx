'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3, Gamepad2, RefreshCw, TrendingUp } from 'lucide-react';
import ActivityCard from '@/components/ActivityCard';
import { compact, full } from '@/components/GameParts';
import type { Snapshot } from '@/components/ActivityChart';
import { PUBLISHED, published } from '@/lib/source';

type Growth = { pct: number; from: string; to: string };
type Similar = { id: number; name: string; creator: string | null; icon?: string | null; playing: number; growth: Growth | null; history: Snapshot[] };
type Research = { id: number; name: string; creator: string | null; genre: string | null; place: number | null; icon: string | null; playing: number | null; peak: number | null; visits?: number | null; favorites?: number | null; first_seen: string; history: Snapshot[]; growth?: Growth | null; similar?: Similar[]; updates: { updated_at: string; seen_at: string }[]; charts: { sort_id: string; rank: number; ts: string }[] };
const date = (ts: string) => new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const freshness = (ts: string, now: number) => { const minutes = Math.max(0, Math.floor((now - Date.parse(ts)) / 60_000)); return minutes < 1 ? 'Updated just now' : minutes < 60 ? `Updated ${minutes} min ago` : minutes < 1440 ? `Updated ${Math.floor(minutes / 60)}h ago` : `Updated ${date(ts)}`; };
const labels: Record<string, string> = { 'top-playing-now': 'Top playing now', 'top-trending': 'Top trending', 'up-and-coming': 'Up-and-coming', 'top-revisited': 'Top revisited' };
const percent = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

function Comparison({ game, other }: { game: Research; other: Similar }) {
  const a = game.history, b = other.history;
  if (a.length < 2 || b.length < 2) return <p className="empty">Not enough shared history to compare these games.</p>;
  const start = Math.max(Date.parse(a[0].ts), Date.parse(b[0].ts), Date.parse(a.at(-1)!.ts) - 7 * 864e5);
  const end = Math.min(Date.parse(a.at(-1)!.ts), Date.parse(b.at(-1)!.ts));
  const left = a.filter((s) => Date.parse(s.ts) >= start && Date.parse(s.ts) <= end);
  const right = b.filter((s) => Date.parse(s.ts) >= start && Date.parse(s.ts) <= end);
  if (end <= start || left.length < 2 || right.length < 2) return <p className="empty">Not enough shared history to compare these games.</p>;
  const max = [...left, ...right].reduce((highest, snapshot) => Math.max(highest, snapshot.players), 1);
  const points = (rows: Snapshot[]) => rows.map((s) => `${((Date.parse(s.ts) - start) / (end - start) * 1000).toFixed(1)},${(150 - s.players / max * 140).toFixed(1)}`).join(' ');
  return <div className="comparison"><div className="comparison-legend"><span><i />{game.name}</span><span><i />{other.name}</span></div><svg viewBox="0 0 1000 160" preserveAspectRatio="none" role="img" aria-label={`Player counts for ${game.name} and ${other.name} from ${date(new Date(start).toISOString())} to ${date(new Date(end).toISOString())}, on the same scale`}><polyline points={points(left)} /><polyline points={points(right)} /></svg><div className="comparison-axis"><span>{date(new Date(start).toISOString())}</span><span>{compact(max)} players at top</span><span>{date(new Date(end).toISOString())}</span></div></div>;
}

export default function GameResearch() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Research | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    setGame(null); setError(''); setSelected(null);
    if (!/^\d{1,15}$/.test(id)) { setError('Game not found.'); return; }
    const refresh = () => fetch(PUBLISHED ? published(`games/${id}.json`) : `/api/games/${id}`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error(); return res.json() as Promise<Research>; })
      .then((data) => { if (active) { setGame(data); setError(''); } })
      .catch(() => { if (active) setError('Game research is unavailable right now.'); });
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [id]);
  return <main className="wrap game-research">
    {!game && error ? <p className="empty">{error}</p> : !game ? <p className="empty">Loading game research…</p> : <>
      <header className="research-head">
        {game.icon ? <img src={game.icon} alt="" className="research-icon" /> : <span className="research-icon research-initial">{game.name.charAt(0)}</span>}
        <div className="research-title"><h1>{game.name}</h1><p>{game.creator ?? 'Roblox experience'}{game.genre ? ` · ${game.genre}` : ''}</p></div>
        {game.place && <a className="research-roblox" href={`https://www.roblox.com/games/${game.place}`} target="_blank" rel="noopener noreferrer">Open on Roblox<span className="sr-only"> (opens in a new tab)</span></a>}
      </header>
      <div className="research-stats" aria-label="Game statistics">
        <div><span>Playing</span><strong title={game.history.at(-1) ? full(game.history.at(-1)!.players) : undefined}>{game.history.at(-1) ? compact(game.history.at(-1)!.players) : '—'}</strong><small>{game.history.at(-1) ? freshness(game.history.at(-1)!.ts, now) : 'No snapshot yet'}</small></div>
        <div><span>Observed peak</span><strong title={game.peak != null ? full(game.peak) : undefined}>{game.peak != null ? compact(game.peak) : '—'}</strong><small>Highest seen by Bopzi</small></div>
        <div><span>Visits</span><strong title={game.visits != null ? full(game.visits) : undefined}>{game.visits != null ? compact(game.visits) : '—'}</strong></div>
        <div><span>Favorites</span><strong title={game.favorites != null ? full(game.favorites) : undefined}>{game.favorites != null ? compact(game.favorites) : '—'}</strong></div>
      </div>
      <div className="research-layout">
        <section className="research-chart" aria-label="Player history"><ActivityCard history={game.history} showRanges /></section>
        <div className="research-side">
          <section className={`research-panel research-growth${game.growth && game.growth.pct < 0 ? ' is-down' : ''}`}><div className="research-panel-head"><div><h2>Growth</h2><p>Compared with about 24 hours ago</p></div><span className="research-panel-icon"><TrendingUp size={18} aria-hidden="true" /></span></div>{game.growth ? <div className="growth-content"><strong className={game.growth.pct >= 0 ? 'research-up' : 'research-down'}>{percent(game.growth.pct)}</strong><span>players</span><small>{new Date(game.growth.from).toLocaleString()} – {new Date(game.growth.to).toLocaleString()}</small></div> : <div className="research-empty"><strong>Not enough history yet</strong><p>Growth appears when there are comparable snapshots from about a day apart.</p></div>}</section>
          <section className="research-panel"><div className="research-panel-head"><div><h2>Similar games</h2><p>Similar size and genre</p></div><span className="research-panel-icon"><Gamepad2 size={18} aria-hidden="true" /></span></div>{game.similar?.length ? <div className="similar-list">{game.similar.map((other) => <button type="button" key={other.id} className="similar-row" aria-pressed={selected === other.id} onClick={() => setSelected(selected === other.id ? null : other.id)}>{other.icon ? <img className="similar-icon" src={other.icon} alt="" /> : <span className="similar-icon similar-initial">{other.name.charAt(0).toUpperCase()}</span>}<span className="similar-info"><strong>{other.name}</strong><small>{compact(other.playing)} playing{other.growth ? ` · ${percent(other.growth.pct)} vs ~24h ago` : ''}</small></span><span className="similar-action">{selected === other.id ? 'Hide' : 'Compare'}</span></button>)}</div> : <div className="research-empty"><strong>No matches yet</strong><p>Similar tracked games will appear here.</p></div>}</section>
          {selected != null && game.similar?.find((other) => other.id === selected) && <section className="research-panel research-comparison"><h2>Compare players</h2><Comparison game={game} other={game.similar.find((other) => other.id === selected)!} /></section>}
          <section className="research-panel"><div className="research-panel-head"><div><h2>Roblox charts</h2><p>Latest collected positions</p></div><span className="research-panel-icon"><BarChart3 size={18} aria-hidden="true" /></span></div>{game.charts.length ? <ul className="research-list">{game.charts.map((chart) => <li key={chart.sort_id}><span>{labels[chart.sort_id] ?? chart.sort_id}</span><b>#{chart.rank}</b><small>Observed {date(chart.ts)}</small></li>)}</ul> : <div className="research-empty"><strong>No chart positions yet</strong><p>This game wasn’t in the latest collected charts.</p></div>}</section>
          <section className="research-panel"><div className="research-panel-head"><div><h2>Recent updates</h2><p>Changes seen by Bopzi</p></div><span className="research-panel-icon"><RefreshCw size={18} aria-hidden="true" /></span></div>{game.updates.length ? <ul className="research-list">{game.updates.map((update) => <li key={update.updated_at}><span>Game updated</span><small>{date(update.updated_at)}</small></li>)}</ul> : <div className="research-empty"><strong>No updates recorded yet</strong><p>Updates will appear as they’re collected.</p></div>}</section>
        </div>
      </div>
    </>}
  </main>;
}
