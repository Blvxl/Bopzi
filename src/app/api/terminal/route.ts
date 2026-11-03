import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/data';
import { icons } from '@/lib/icons';
import { latestEvents } from '@/lib/pulse';
import { linkSeries, type TotalRow } from '@/lib/series';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const DAY = 864e5;

type Top = { id: number; name: string; creator: string | null; playing: number };
type Move = { id: number; name: string; creator: string | null; place: number | null; first: number; last: number };

/** Downsample a series to at most n points, keeping the last one. */
const thin = (v: number[], n: number) => {
  if (v.length <= n) return v;
  const out = Array.from({ length: n - 1 }, (_, i) => v[Math.floor((i * (v.length - 1)) / (n - 1))]);
  return [...out, v[v.length - 1]];
};

/** The page's data: the headline total over time, the busiest games now, and the games climbing fastest. */
export async function GET(req: Request) {
  const wanted = Number(new URL(req.url).searchParams.get('pulse'));
  const pulseLimit = Number.isFinite(wanted) && wanted > 0 ? Math.min(wanted, 200) : 40;
  const file = dbPath();
  if (!existsSync(file)) return Response.json({ history: [], top: [], rising: [], error: 'No local collection yet.' }, { headers });
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    // Every total, with how many of its players were in newly found games. The page chains them itself, so a total pushed live fits in.
    const hasAdded = (db.prepare('PRAGMA table_info(totals)').all() as { name: string }[]).some((c) => c.name === 'added');
    const totals = db.prepare(hasAdded ? 'SELECT ts, players, games, added FROM totals ORDER BY ts' : 'SELECT ts, players, games, NULL AS added FROM totals ORDER BY ts').all() as TotalRow[];
    const history = linkSeries(totals);
    const total = history.at(-1)?.players ?? 0;

    const top = db.prepare('SELECT universe_id AS id, name, creator_name AS creator, playing FROM games WHERE playing > 0 ORDER BY playing DESC LIMIT 60').all() as Top[];

    // Rising: how much a game grew over the last day, measured against how the whole market moved, because every game
    // swells in the evening and shrinks at night and that is not a reason to call any one of them rising.
    const lastTs = (db.prepare('SELECT MAX(ts) AS t FROM snapshots').get() as { t: string | null }).t;
    let rising: (Top & { place: number | null; change: number; pct: number; spark: number[] })[] = [];
    if (lastTs) {
      const since = new Date(new Date(lastTs).getTime() - DAY).toISOString();
      const moves = db.prepare(`
        WITH r AS (SELECT universe_id, MIN(ts) AS a, MAX(ts) AS b FROM snapshots WHERE ts >= ? GROUP BY universe_id HAVING COUNT(*) >= 2)
        SELECT g.universe_id AS id, g.name, g.creator_name AS creator, g.root_place_id AS place, x.playing AS first, y.playing AS last
        FROM r JOIN snapshots x ON x.universe_id = r.universe_id AND x.ts = r.a
               JOIN snapshots y ON y.universe_id = r.universe_id AND y.ts = r.b
               JOIN games g ON g.universe_id = r.universe_id
        WHERE y.playing >= 1000 AND x.playing >= 300`).all(since) as Move[];
      const ratios = moves.map((m) => m.last / m.first).sort((a, b) => a - b);
      const market = ratios[Math.floor(ratios.length / 2)] || 1;
      const series = db.prepare('SELECT playing FROM snapshots WHERE universe_id = ? AND ts >= ? ORDER BY ts');
      rising = moves
        .map((m) => ({ id: m.id, name: m.name, creator: m.creator, place: m.place, playing: m.last, change: m.last - m.first, pct: (m.last / m.first / market - 1) * 100 }))
        .filter((m) => m.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 24)
        .map((m) => ({ ...m, spark: thin((series.all(m.id, since) as { playing: number }[]).map((r) => r.playing), 32) }));
    }

    // Over the last 24 hours of totals: the high, the low and the average.
    const dayAgo = history.length ? new Date(new Date(history[history.length - 1].ts).getTime() - DAY).toISOString() : '';
    const day = history.filter((h) => h.ts >= dayAgo).map((h) => h.players);
    const stats = day.length ? { peak: Math.max(...day), low: Math.min(...day), average: Math.round(day.reduce((a, b) => a + b, 0) / day.length), points: day.length, games: history.at(-1)!.games } : null;

    // The most visited games ever, from the latest saved row of each, and games under a week old that already have players.
    const visited = db.prepare(`SELECT g.universe_id AS id, g.name, g.creator_name AS creator, g.playing, s.visits, s.favorites
      FROM games g JOIN snapshots s ON s.universe_id = g.universe_id AND s.ts = (SELECT MAX(ts) FROM snapshots WHERE universe_id = g.universe_id)
      WHERE s.visits IS NOT NULL ORDER BY s.visits DESC LIMIT 8`).all() as (Top & { visits: number; favorites: number | null })[];
    const fresh = db.prepare('SELECT universe_id AS id, name, creator_name AS creator, playing, created FROM games WHERE created >= ? AND playing >= 100 ORDER BY playing DESC LIMIT 8')
      .all(new Date(Date.now() - 7 * DAY).toISOString()) as (Top & { created: string })[];

    // The live feed: what just happened, newest first.
    const pulse = await latestEvents(db, pulseLimit);

    const icon = await icons([...new Set([...top, ...rising, ...visited, ...fresh].map((t) => t.id))]);
    return Response.json({
      history, total, stats,
      pulse, totals,
      visited: visited.map((v) => ({ ...v, icon: icon(v.id) })),
      fresh: fresh.map((f) => ({ ...f, icon: icon(f.id) })),
      top: top.map((t) => ({ ...t, icon: icon(t.id) })),
      rising: rising.map((r) => ({ ...r, icon: icon(r.id) })),
    }, { headers });
  } catch {
    return Response.json({ history: [], top: [], rising: [], error: 'Could not read the local collection.' }, { status: 503, headers });
  } finally { db?.close(); }
}
