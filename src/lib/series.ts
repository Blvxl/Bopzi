/** A saved total. `added` is how many of its players were in games found since the previous total; older rows have none. */
export type TotalRow = { ts: string; players: number; games: number; added: number | null };
export type Point = { ts: string; players: number; games: number };

/**
 * The series the chart plots. Every time Bopzi finds more games the raw total jumps, which looks like players arriving, so each
 * step is measured on the games both totals contain and the series is chained back from the latest total: the newest point is
 * the real count, older points are what that same count would have been then. Until two comparable totals exist the raw totals are used.
 * It runs in the browser too, so a total pushed live slots in without the whole series being fetched again.
 */
export function linkSeries(all: TotalRow[]): Point[] {
  const rows = all.filter((r) => r.added != null) as (TotalRow & { added: number })[];
  if (rows.length < 2) return all.map(({ ts, players, games }) => ({ ts, players, games }));
  const out = rows.map(({ ts, players, games }) => ({ ts, players, games }));
  for (let i = rows.length - 1; i >= 1; i--) {
    const common = rows[i].players - rows[i].added;
    if (common > 0 && rows[i - 1].players > 0) out[i - 1].players = Math.round(out[i].players * (rows[i - 1].players / common));
  }
  return out;
}
