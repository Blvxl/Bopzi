// Local database in data/bopzi.sqlite, for development. Same shape as db/schema.sql.
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

/** Columns added to `games` after the first version; an older database gets them added when it is opened. */
const GAME_COLUMNS = {
  playing: 'integer', description: 'text', max_players: 'integer', price: 'integer', avatar_type: 'text', creator_verified: 'integer',
  visits: 'integer', favorites: 'integer', up_votes: 'integer', down_votes: 'integer', peak: 'integer',
};

export function openSqlite(file = 'data/bopzi.sqlite') {
  mkdirSync('data', { recursive: true });
  const db = new DatabaseSync(file);
  // The tick and discover runs write at the same time; wait for each other instead of failing with "database is locked".
  db.exec('pragma busy_timeout = 30000');
  db.exec(`
    create table if not exists games (universe_id integer primary key, root_place_id integer, name text not null, creator_id integer, creator_name text, creator_type text, genre_l1 text, genre_l2 text, created text, updated text, first_seen text not null, last_seen text not null);
    create table if not exists snapshots (universe_id integer not null, ts text not null, playing integer not null, visits integer, favorites integer, up_votes integer, down_votes integer, updated text, primary key (universe_id, ts));
    create table if not exists totals (ts text primary key, players integer not null, games integer not null, added integer);
    create table if not exists searches (query text primary key, ts text not null, found integer not null);
    create table if not exists chart_entries (ts text not null, sort_id text not null, rank integer not null, universe_id integer not null, primary key (ts, sort_id, rank));
    create table if not exists game_updates (universe_id integer not null, updated_at text not null, seen_at text not null, primary key (universe_id, updated_at));
    create table if not exists genre_totals (ts text not null, genre text not null, players integer not null, games integer not null, primary key (ts, genre));
    create table if not exists events (id integer primary key autoincrement, ts text not null, universe_id integer not null, kind text not null, value integer, prev integer, detail text, key text not null, unique (universe_id, key));
    create index if not exists events_ts_idx on events (ts desc);
    create table if not exists game_tags (universe_id integer not null, kind text not null, tag text not null, primary key (universe_id, kind, tag));
    create index if not exists game_tags_tag_idx on game_tags (kind, tag);
    create table if not exists tag_state (universe_id integer primary key, hash text not null, checked text not null);
    create table if not exists game_looks (universe_id integer primary key, look text not null, brightness real, saturation real, hue real, checked text not null);
    create table if not exists search_terms (ts text not null, query text not null, rank integer not null, trending integer not null, players integer, primary key (ts, query));
    create table if not exists game_events (universe_id integer not null, event_id text not null, title text, description text, starts text, ends text, status text, seen text not null, primary key (universe_id, event_id));
    create table if not exists event_checks (universe_id integer primary key, ts text not null);
    create table if not exists creator_changes (id integer primary key autoincrement, ts text not null, universe_id integer not null, from_id integer, from_name text, from_type text, to_id integer, to_name text, to_type text, unique (universe_id, ts));
    create table if not exists creators (creator_id integer not null, type text not null, name text, description text, owner_id integer, owner_type text, created text, verified integer, checked text not null, primary key (creator_id, type));
  `);
  const has = (table, column) => db.prepare(`pragma table_info(${table})`).all().some((c) => c.name === column);
  // Older databases: a total's `added` (players in games found since the previous total) and the extra game columns.
  if (!has('totals', 'added')) db.exec('alter table totals add column added integer');
  const fresh = !has('games', 'playing');
  for (const [name, type] of Object.entries(GAME_COLUMNS)) if (!has('games', name)) db.exec(`alter table games add column ${name} ${type}`);
  // The highest player count seen for each game, for the "new high" events. Starts from the saved history.
  if (db.prepare('select count(*) n from games where peak is not null').get().n === 0) db.exec('update games set peak = max(coalesce(playing, 0), coalesce((select max(s.playing) from snapshots s where s.universe_id = games.universe_id), 0))');
  if (fresh) db.exec('update games set playing = (select s.playing from snapshots s where s.universe_id = games.universe_id order by s.ts desc limit 1)');

  // `last_seen` only moves forward while someone is playing, so a game that has emptied out ages out of the tracked set after a day.
  // Fields a lookup did not bring back keep what was stored before.
  const upsertGame = db.prepare(`insert into games (universe_id, root_place_id, name, creator_id, creator_name, creator_type, genre_l1, genre_l2, created, updated, first_seen, last_seen, playing, description, max_players, price, avatar_type, creator_verified, visits, favorites, up_votes, down_votes, peak)
    values (:universe_id, :root_place_id, :name, :creator_id, :creator_name, :creator_type, :genre_l1, :genre_l2, :created, :updated, :last_seen, :last_seen, :playing, :description, :max_players, :price, :avatar_type, :creator_verified, :visits, :favorites, :up_votes, :down_votes, :peak)
    on conflict(universe_id) do update set root_place_id=coalesce(excluded.root_place_id, games.root_place_id), name=excluded.name, creator_id=coalesce(excluded.creator_id, games.creator_id), creator_name=coalesce(excluded.creator_name, games.creator_name), creator_type=coalesce(excluded.creator_type, games.creator_type), genre_l1=coalesce(excluded.genre_l1, games.genre_l1), genre_l2=coalesce(excluded.genre_l2, games.genre_l2), created=coalesce(excluded.created, games.created), updated=coalesce(excluded.updated, games.updated), playing=excluded.playing,
      description=coalesce(excluded.description, games.description), max_players=coalesce(excluded.max_players, games.max_players), price=coalesce(excluded.price, games.price), avatar_type=coalesce(excluded.avatar_type, games.avatar_type), creator_verified=coalesce(excluded.creator_verified, games.creator_verified),
      visits=coalesce(excluded.visits, games.visits), favorites=coalesce(excluded.favorites, games.favorites), up_votes=coalesce(excluded.up_votes, games.up_votes), down_votes=coalesce(excluded.down_votes, games.down_votes), peak=max(coalesce(excluded.peak, 0), coalesce(games.peak, 0)),
      last_seen=case when excluded.playing > 0 then excluded.last_seen else games.last_seen end`);
  const addSnap = db.prepare('insert or replace into snapshots values (:universe_id, :ts, :playing, :visits, :favorites, :up_votes, :down_votes, :updated)');
  const addChart = db.prepare('insert or replace into chart_entries values (:ts, :sort_id, :rank, :universe_id)');
  const addTotal = db.prepare('insert or replace into totals (ts, players, games, added) values (:ts, :players, :games, :added)');
  const addSearch = db.prepare('insert or replace into searches values (:query, :ts, :found)');
  const addUpdate = db.prepare('insert or ignore into game_updates values (:universe_id, :updated_at, :seen_at)');
  const addGenre = db.prepare('insert or replace into genre_totals values (:ts, :genre, :players, :games)');
  const addEvent = db.prepare('insert or ignore into events (ts, universe_id, kind, value, prev, detail, key) values (:ts, :universe_id, :kind, :value, :prev, :detail, :key)');
  const addHand = db.prepare('insert or ignore into creator_changes (ts, universe_id, from_id, from_name, from_type, to_id, to_name, to_type) values (:ts, :universe_id, :from_id, :from_name, :from_type, :to_id, :to_name, :to_type)');
  const addCreator = db.prepare('insert or replace into creators values (:creator_id, :type, :name, :description, :owner_id, :owner_type, :created, :verified, :checked)');
  const many = (stmt, rows = []) => {
    db.exec('begin');
    try { for (const r of rows) stmt.run(r); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; }
  };
  return {
    kind: 'sqlite',
    /** The open database, for the enrichment jobs that are local-only for now. */
    db,
    /** Games seen recently, with what was last stored. A game that has been empty for a day is left out. */
    async trackedGames(sinceIso, emptyAfterIso, limit) {
      return db.prepare('select universe_id as id, playing, first_seen, updated, genre_l1, peak, creator_id, creator_name, creator_type from games where last_seen >= ? and (coalesce(playing, 1) > 0 or last_seen >= ?) order by last_seen desc limit ?').all(sinceIso, emptyAfterIso, limit)
        .map((r) => ({ id: r.id, playing: r.playing, firstSeen: r.first_seen, updated: r.updated, genre: r.genre_l1, peak: r.peak, creatorId: r.creator_id, creatorName: r.creator_name, creatorType: r.creator_type }));
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
    /** Groups that own games and have not been looked up since a date, busiest first. */
    async staleGroups(olderThanIso, limit) {
      return db.prepare(`select g.creator_id as id from games g left join creators c on c.creator_id = g.creator_id and c.type = 'Group'
        where g.creator_type = 'Group' and (c.checked is null or c.checked < ?) group by g.creator_id order by max(coalesce(g.playing, 0)) desc limit ?`).all(olderThanIso, limit).map((r) => r.id);
    },
    /** Player counts saved between two times, for spotting a game that jumped in the last few minutes. */
    async playersBetween(fromIso, toIso) { return db.prepare('select universe_id, playing, ts from snapshots where ts >= ? and ts <= ? order by ts').all(fromIso, toIso); },
    /** Updates noticed between two times, to look at how the players moved afterwards. */
    async updatesBetween(fromIso, toIso) { return db.prepare('select universe_id, updated_at from game_updates where seen_at >= ? and seen_at <= ?').all(fromIso, toIso); },
    /** A game's player count as last saved at or before a time. */
    async playerAt(id, iso) { return db.prepare('select playing from snapshots where universe_id = ? and ts <= ? order by ts desc limit 1').get(id, iso)?.playing ?? null; },
    /** The busiest each game was inside a window, and how many counts that rests on, to tell a comeback from a game that was always there. */
    async quietBefore(fromIso, toIso) { return db.prepare('select universe_id, max(playing) as top, count(*) as n from snapshots where ts >= ? and ts <= ? group by universe_id').all(fromIso, toIso); },
    /** Which kinds of event a game already had lately, so the same thing is not announced twice. */
    async recentEvents(sinceIso) { return db.prepare('select universe_id, kind from events where ts >= ?').all(sinceIso); },
    /** Every game the collector knows, so a search can tell which results are new. */
    async knownIds() { return db.prepare('select universe_id as id from games').all().map((r) => r.id); },
    /** When the last total was saved. */
    async lastTotalTs() { return db.prepare('select max(ts) as t from totals').get().t ?? ''; },
    /** When per-game rows were last saved, so they are written about every five minutes however often the total is. */
    async lastSnapshotTs() { return db.prepare('select max(ts) as t from snapshots').get().t ?? ''; },
    async save({ games = [], snapshots = [], charts = [], totals = [], updates = [], genres = [], creators = [], events = [], hands = [] }) {
      many(upsertGame, games); many(addSnap, snapshots); many(addChart, charts); many(addTotal, totals);
      many(addUpdate, updates); many(addGenre, genres); many(addCreator, creators); many(addEvent, events); many(addHand, hands);
    },
  };
}
