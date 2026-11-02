// Local database in data/bopzi.sqlite, for development. Same shape as db/schema.sql.
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function openSqlite(file = 'data/bopzi.sqlite') {
  mkdirSync('data', { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    create table if not exists games (universe_id integer primary key, root_place_id integer, name text not null, creator_id integer, creator_name text, creator_type text, genre_l1 text, genre_l2 text, created text, updated text, first_seen text not null, last_seen text not null);
    create table if not exists snapshots (universe_id integer not null, ts text not null, playing integer not null, visits integer, favorites integer, up_votes integer, down_votes integer, updated text, primary key (universe_id, ts));
    create table if not exists chart_entries (ts text not null, sort_id text not null, rank integer not null, universe_id integer not null, primary key (ts, sort_id, rank));
  `);
  const upsertGame = db.prepare(`insert into games (universe_id, root_place_id, name, creator_id, creator_name, creator_type, genre_l1, genre_l2, created, updated, first_seen, last_seen)
    values (:universe_id, :root_place_id, :name, :creator_id, :creator_name, :creator_type, :genre_l1, :genre_l2, :created, :updated, :last_seen, :last_seen)
    on conflict(universe_id) do update set root_place_id=excluded.root_place_id, name=excluded.name, creator_id=excluded.creator_id, creator_name=excluded.creator_name, creator_type=excluded.creator_type, genre_l1=excluded.genre_l1, genre_l2=excluded.genre_l2, created=excluded.created, updated=excluded.updated, last_seen=excluded.last_seen`);
  const addSnap = db.prepare('insert or replace into snapshots values (:universe_id, :ts, :playing, :visits, :favorites, :up_votes, :down_votes, :updated)');
  const addChart = db.prepare('insert or replace into chart_entries values (:ts, :sort_id, :rank, :universe_id)');
  const many = (stmt, rows) => {
    db.exec('begin');
    try { for (const r of rows) stmt.run(r); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; }
  };
  return {
    kind: 'sqlite',
    /** Games seen recently, so one that drops off the lists keeps being tracked. */
    async trackedIds(sinceIso, limit) {
      return db.prepare('select universe_id as id from games where last_seen >= ? order by last_seen desc limit ?').all(sinceIso, limit).map((r) => r.id);
    },
    async save({ games, snapshots, charts }) { many(upsertGame, games); many(addSnap, snapshots); many(addChart, charts); },
  };
}
