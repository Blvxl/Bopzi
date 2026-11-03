import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dbPath } from '@/lib/data';
import { icons } from '@/lib/icons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return Response.json({ error: 'Invalid game ID.' }, { status: 400, headers });
  const file = dbPath();
  if (!existsSync(file)) return Response.json({ error: 'No collection available.' }, { status: 404, headers });
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const game = db.prepare(`SELECT universe_id AS id, root_place_id AS place, name, creator_name AS creator,
      genre_l1 AS genre, playing, peak, visits, favorites, first_seen FROM games WHERE universe_id = ?`).get(Number(id)) as { id: number; genre: string | null; playing: number | null } | undefined;
    if (!game) return Response.json({ error: 'Game not found.' }, { status: 404, headers });
    const history = db.prepare('SELECT ts, playing AS players, 1 AS games FROM snapshots WHERE universe_id = ? ORDER BY ts').all(Number(id)) as { ts: string; players: number; games: number }[];
    const recent = history.at(-1);
    const growth = (rows: typeof history) => {
      const last = rows.at(-1);
      if (!last) return null;
      const target = Date.parse(last.ts) - 864e5;
      const baseline = rows.reduce<(typeof rows)[number] | null>((best, row) => Math.abs(Date.parse(row.ts) - target) < Math.abs(Date.parse(best?.ts ?? '1970-01-01') - target) ? row : best, null);
      if (!baseline || Math.abs(Date.parse(baseline.ts) - target) > 60 * 60e3 || baseline.players <= 0) return null;
      return { pct: (last.players / baseline.players - 1) * 100, from: baseline.ts, to: last.ts };
    };
    const candidates = game.genre && game.genre !== 'Unknown' && recent && recent.players > 0 ? db.prepare(`SELECT universe_id AS id, name, creator_name AS creator, playing
      FROM games WHERE universe_id != ? AND genre_l1 = ? AND playing BETWEEN ? AND ? AND last_seen >= ?
      ORDER BY ABS(playing - ?) LIMIT 4`).all(game.id, game.genre, Math.max(1, Math.floor(recent.players / 2)), recent.players * 2, new Date(Date.parse(recent.ts) - 30 * 60e3).toISOString(), recent.players) as { id: number; name: string; creator: string | null; playing: number }[] : [];
    const getHistory = db.prepare('SELECT ts, playing AS players, 1 AS games FROM snapshots WHERE universe_id = ? AND ts >= ? ORDER BY ts');
    const cutoff = recent ? new Date(Date.parse(recent.ts) - 7 * 864e5).toISOString() : '';
    const similar = candidates.map((candidate) => {
      const rows = getHistory.all(candidate.id, cutoff) as typeof history;
      const latest = rows.at(-1);
      if (!latest || !recent || Math.abs(Date.parse(recent.ts) - Date.parse(latest.ts)) > 30 * 60e3) return null;
      return { ...candidate, playing: latest.players, growth: growth(rows), history: rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 300)) === 0 || i === rows.length - 1) };
    }).filter((candidate) => candidate !== null);
    const updates = db.prepare('SELECT updated_at, seen_at FROM game_updates WHERE universe_id = ? ORDER BY updated_at DESC LIMIT 10').all(Number(id));
    const charts = db.prepare(`SELECT c.sort_id, c.rank, c.ts FROM chart_entries c
      WHERE c.universe_id = ? AND c.ts = (SELECT MAX(x.ts) FROM chart_entries x WHERE x.sort_id = c.sort_id)
      ORDER BY c.sort_id`).all(Number(id));
    const icon = await icons([Number(id), ...similar.map((candidate) => candidate.id)]);
    return Response.json({ ...game, icon: icon(Number(id)), history, growth: growth(history), similar: similar.map((candidate) => ({ ...candidate, icon: icon(candidate.id) })), updates, charts }, { headers });
  } catch {
    return Response.json({ error: 'Could not read game research.' }, { status: 503, headers });
  } finally { db.close(); }
}
