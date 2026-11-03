import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const DAY = 864e5;

type Top = { id: number; name: string; creator: string | null; playing: number };
type Move = { id: number; name: string; creator: string | null; first: number; last: number };

// Game icons come from Roblox's thumbnail service. They rarely change, so they are remembered for a few minutes.
const iconCache = new Map<number, { url: string; at: number }>();
async function icons(ids: number[]) {
  const need = ids.filter((id) => Date.now() - (iconCache.get(id)?.at ?? 0) > 10 * 60e3);
  for (let i = 0; i < need.length; i += 50) {
    try {
      const res = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${need.slice(i, i + 50).join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
      if (!res.ok) continue;
      const body = await res.json() as { data?: { targetId: number; imageUrl?: string }[] };
      for (const d of body.data ?? []) if (d.imageUrl) iconCache.set(d.targetId, { url: d.imageUrl, at: Date.now() });
    } catch { /* the cards show an initial instead */ }
  }
  return (id: number) => iconCache.get(id)?.url ?? null;
}

/** Downsample a series to at most n points, keeping the last one. */
const thin = (v: number[], n: number) => {
  if (v.length <= n) return v;
  const out = Array.from({ length: n - 1 }, (_, i) => v[Math.floor((i * (v.length - 1)) / (n - 1))]);
  return [...out, v[v.length - 1]];
};

/** The page's data: the headline total over time, the busiest games now, and the games climbing fastest. */
export async function GET() {
  const file = process.env.BOPZI_DB ?? path.join(process.cwd(), 'data', 'bopzi.sqlite');
  if (!existsSync(file)) return Response.json({ history: [], top: [], rising: [], error: 'No local collection yet.' }, { headers });
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    // Totals only exist for runs that covered the wide set of games; earlier snapshots covered far fewer and are not comparable.
    const history = db.prepare('SELECT ts, players, games FROM totals ORDER BY ts').all() as { ts: string; players: number; games: number }[];
    const total = history.at(-1)?.players ?? 0;

    const top = db.prepare('SELECT universe_id AS id, name, creator_name AS creator, playing FROM games WHERE playing > 0 ORDER BY playing DESC LIMIT 60').all() as Top[];

    // Rising: how much a game grew over the last day, measured against how the whole market moved, because every game
    // swells in the evening and shrinks at night and that is not a reason to call any one of them rising.
    const lastTs = (db.prepare('SELECT MAX(ts) AS t FROM snapshots').get() as { t: string | null }).t;
    let rising: (Top & { change: number; pct: number; spark: number[] })[] = [];
    if (lastTs) {
      const since = new Date(new Date(lastTs).getTime() - DAY).toISOString();
      const moves = db.prepare(`
        WITH r AS (SELECT universe_id, MIN(ts) AS a, MAX(ts) AS b FROM snapshots WHERE ts >= ? GROUP BY universe_id HAVING COUNT(*) >= 2)
        SELECT g.universe_id AS id, g.name, g.creator_name AS creator, x.playing AS first, y.playing AS last
        FROM r JOIN snapshots x ON x.universe_id = r.universe_id AND x.ts = r.a
               JOIN snapshots y ON y.universe_id = r.universe_id AND y.ts = r.b
               JOIN games g ON g.universe_id = r.universe_id
        WHERE y.playing >= 1000 AND x.playing >= 300`).all(since) as Move[];
      const ratios = moves.map((m) => m.last / m.first).sort((a, b) => a - b);
      const market = ratios[Math.floor(ratios.length / 2)] || 1;
      const series = db.prepare('SELECT playing FROM snapshots WHERE universe_id = ? AND ts >= ? ORDER BY ts');
      rising = moves
        .map((m) => ({ id: m.id, name: m.name, creator: m.creator, playing: m.last, change: m.last - m.first, pct: (m.last / m.first / market - 1) * 100 }))
        .filter((m) => m.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 24)
        .map((m) => ({ ...m, spark: thin((series.all(m.id, since) as { playing: number }[]).map((r) => r.playing), 32) }));
    }

    const icon = await icons([...new Set([...top.map((t) => t.id), ...rising.map((r) => r.id)])]);
    return Response.json({
      history, total,
      top: top.map((t) => ({ ...t, icon: icon(t.id) })),
      rising: rising.map((r) => ({ ...r, icon: icon(r.id) })),
    }, { headers });
  } catch {
    return Response.json({ history: [], top: [], rising: [], error: 'Could not read the local collection.' }, { status: 503, headers });
  } finally { db?.close(); }
}
