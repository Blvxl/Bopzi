'use client';

import type { GameCard, Riser } from './useOverview';

export const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export const full = (n: number) => new Intl.NumberFormat('en-US').format(n);

export function GameIcon({ game, size = 44 }: { game: GameCard; size?: number }) {
  return game.icon
    ? <img className="g-icon" src={game.icon} alt="" width={size} height={size} loading="lazy" />
    : <span className="g-icon g-initial" style={{ width: size, height: size }}>{game.name.charAt(0).toUpperCase()}</span>;
}

/** A smooth little line of a game's players over the last day. */
export function Sparkline({ values, up = true }: { values: number[]; up?: boolean }) {
  if (values.length < 2) return null;
  const w = 96, h = 36, pad = 3;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (1 - (v - lo) / span) * (h - pad * 2)] as const);
  // Smooth through the midpoints of the segments (quadratic curves), which never overshoots the data.
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1)} ${((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1)}`;
  d += `L${pts.at(-1)![0]} ${pts.at(-1)![1]}`;
  const id = `sp${values.length}${Math.round(values[0])}${Math.round(values.at(-1)!)}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity={up ? '.28' : '.12'} /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RisingCard({ game }: { game: Riser }) {
  return (
    <article className="r-card">
      <div className="r-top">
        <GameIcon game={game} />
        <div className="r-name"><strong title={game.name}>{game.name}</strong><span>{game.creator ?? 'Roblox experience'}</span></div>
        <Sparkline values={game.spark} />
      </div>
      <div className="r-foot">
        <b>{compact(game.playing)}</b>
        <span className="up">+{game.pct.toFixed(game.pct >= 100 ? 0 : 1)}% <i>vs market</i></span>
      </div>
    </article>
  );
}

export function GameRow({ game, rank, max, value, sub }: { game: GameCard; rank: number; max?: number; value?: string; sub?: string }) {
  return (
    <div className="g-row">
      <span className="g-rank">{rank}</span>
      <GameIcon game={game} size={40} />
      <div className="g-name"><strong title={game.name}>{game.name}</strong><span>{sub ?? game.creator ?? 'Roblox experience'}</span></div>
      {max ? <div className="g-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, (game.playing / max) * 100)}%` }} /></div> : <span />}
      <b className="g-num" title={full(game.playing)}>{value ?? compact(game.playing)}</b>
    </div>
  );
}
