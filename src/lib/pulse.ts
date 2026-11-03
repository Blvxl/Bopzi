import type { DatabaseSync } from 'node:sqlite';
import { icons } from './icons';

type Row = { eid: number; ts: string; kind: string; value: number | null; prev: number | null; detail: string | null; id: number; name: string; genre: string | null; place: number | null };

const SELECT = `SELECT e.id AS eid, e.ts, e.kind, e.value, e.prev, e.detail, g.universe_id AS id, g.name, g.genre_l1 AS genre, g.root_place_id AS place
  FROM events e JOIN games g ON g.universe_id = e.universe_id
  WHERE NOT (e.kind = 'update' AND COALESCE(e.value, 0) < 2000)`; // small games update all the time; only the busier ones are news

const hasEvents = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'").all() as unknown[]).length > 0;

async function shape(rows: Row[]) {
  const icon = await icons([...new Set(rows.map((r) => r.id))]);
  return rows.map((p) => ({ id: p.eid, ts: p.ts, kind: p.kind, value: p.value, prev: p.prev, detail: p.detail, game: { id: p.id, name: p.name, genre: p.genre, place: p.place, icon: icon(p.id) } }));
}

/** The newest events, newest first. */
export async function latestEvents(db: DatabaseSync, limit: number) {
  if (!hasEvents(db)) return [];
  return shape(db.prepare(`${SELECT} ORDER BY e.ts DESC, e.id DESC LIMIT ?`).all(limit) as Row[]);
}

/** Events after a given id, oldest first, so they can be played into the feed in the order they happened. */
export async function eventsAfter(db: DatabaseSync, id: number) {
  if (!hasEvents(db)) return [];
  return shape(db.prepare(`${SELECT} AND e.id > ? ORDER BY e.id LIMIT 50`).all(id) as Row[]);
}

export const lastEventId = (db: DatabaseSync) => hasEvents(db) ? ((db.prepare('SELECT MAX(id) AS n FROM events').get() as { n: number | null }).n ?? 0) : 0;
