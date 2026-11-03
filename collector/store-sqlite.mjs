// Local database in data/bopzi.sqlite, for development. Same shape as db/schema.sql.
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function openSqlite(file = 'data/bopzi.sqlite') {
  mkdirSync('data', { recursive: true });
  const db = new DatabaseSync(file);
  // The tick and discover runs write at the same time; wait for each other instead of failing with "database is locked".
  db.exec('pragma busy_timeout = 30000');
  db.exec(`
    create table if not exists games (universe_id integer primary key, root_place_id integer, name text not null, creator_id integer, creator_name text, creator_type text, genre_l1 text, genre_l2 text, created text, updated text, first_seen text not null, last_seen text not null, playing integer);
    create table if not exists snapshots (universe_id integer not null, ts text not null, playing integer not null, visits integer, favorites integer, up_votes integer, down_votes integer, updated text, primary key (universe_id, ts));
    create table if not exists totals (ts text primary key, players integer not null, games integer not null);
    create table if not exists searches (query text primary key, ts text not null, found integer not null);
    create table if not exists chart_entries (ts text not null, sort_id text not null, rank integer not null, universe_id integer not null, primary key (ts, sort_id, rank));
  `);
  // A database made before games kept their latest player count gets the column added.
  if (!db.prepare('pragma table_info(games)').all().some((c) => c.name === 'playing')) {
    db.exec('alter table games add column playing integer');
    db.exec('update games set playing = (select s.playing from snapshots s where s.universe_id = games.universe_id order by s.ts desc limit 1)');
  }
  // `last_seen` only moves forward while someone is playing, so a game that has emptied out ages out of the tracked set after a day.
  const upsertGame = db.prepare(`insert into games (universe_id, root_place_id, name, creator_id, creator_name, creator_type, genre_l1, genre_l2, created, updated, first_seen, last_seen, playing)
    values (:universe_id, :root_place_id, :name, :creator_id, :creator_name, :creator_type, :genre_l1, :genre_l2, :created, :updated, :last_seen, :last_seen, :playing)
    on conflict(universe_id) do update set root_place_id=coalesce(excluded.root_place_id, games.root_place_id), name=excluded.name, creator_id=coalesce(excluded.creator_id, games.creator_id), creator_name=coalesce(excluded.creator_name, games.creator_name), creator_type=coalesce(excluded.creator_type, games.creator_type), genre_l1=coalesce(excluded.genre_l1, games.genre_l1), genre_l2=coalesce(excluded.genre_l2, games.genre_l2), created=coalesce(excluded.created, games.created), updated=coalesce(excluded.updated, games.updated), playing=excluded.playing, last_seen=case when excluded.playing > 0 then excluded.last_seen else games.last_seen end`);
  const addSnap = db.prepare('insert or replace into snapshots values (:universe_id, :ts, :playing, :visits, :favorites, :up_votes, :down_votes, :updated)');
  const addChart = db.prepare('insert or replace into chart_entries values (:ts, :sort_id, :rank, :universe_id)');
  const addSearch = db.prepare('insert or replace into searches values (:query, :ts, :found)');
  const addTotal = db.prepare('insert or replace into totals values (:ts, :players, :games)');
  const many = (stmt, rows) => {
    db.exec('begin');
    try { for (const r of rows) stmt.run(r); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; }
  };
  return {
    kind: 'sqlite',
    /** Games seen recently, with the player count last seen. A game that has been empty for a day is left out. */
    async trackedGames(sinceIso, emptyAfterIso, limit) {
      return db.prepare('select universe_id as id, playing from games where last_seen >= ? and (coalesce(playing, 1) > 0 or last_seen >= ?) order by last_seen desc limit ?').all(sinceIso, emptyAfterIso, limit).map((r) => ({ id: r.id, playing: r.playing }));
    },
    /** Searches done since a date, so the same word is not asked again right away. */
    async searchedSince(iso) { return db.prepare('select query from searches where ts >= ?').all(iso).map((r) => r.query); },
    async markSearched(rows) { many(addSearch, rows); },
    /** A random sample of creator names and game names, to build new searches from. */
    async sampleTerms(n) {
      return {
        creators: db.prepare('select creator_name as v from games where creator_name is not null group by creator_name order by random() limit ?').all(n).map((r) => r.v),
        names: db.prepare('select name as v from games order by random() limit ?').all(n).map((r) => r.v),
      };
    },
    /** Every game the collector knows, so a search can tell which results are new. */
    async knownIds() { return db.prepare('select universe_id as id from games').all().map((r) => r.id); },
    /** When per-game rows were last saved, so they are written about every five minutes however often the total is. */
    async lastSnapshotTs() { return db.prepare('select max(ts) as t from snapshots').get().t ?? ''; },
    async save({ games, snapshots, charts, totals }) { many(upsertGame, games); many(addSnap, snapshots); many(addChart, charts); many(addTotal, totals); },
  };
}
