// One collection run: read Roblox's lists, look up every game worth tracking, and save a snapshot.
//   npm run collect
// Without SUPABASE_SERVICE_ROLE_KEY it saves to data/bopzi.sqlite, so it can be tried with no setup.
import { chart, details, votes, SORTS } from './roblox.mjs';
import { openSqlite } from './store-sqlite.mjs';
import { openSupabase } from './store-supabase.mjs';

const TRACK_LIMIT = Number(process.env.BOPZI_TRACK_LIMIT ?? 1500);
const KEEP_DAYS = 7;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const store = url && key ? openSupabase(url, key) : openSqlite();

const now = new Date();
const ts = now.toISOString();
const sessionId = crypto.randomUUID();

console.log(`Bopzi collector -> ${store.kind}`);

// 1. Roblox's own lists
const charts = [];
const seen = new Set();
for (const sortId of SORTS) {
  const list = await chart(sortId, sessionId);
  console.log(`  ${sortId}: ${list.length} games`);
  for (const g of list) {
    charts.push({ ts, sort_id: sortId, rank: g.rank, universe_id: g.universeId });
    seen.add(g.universeId);
  }
}

// 2. Games seen in the last week that are not on a list today
const recent = await store.trackedIds(new Date(now - KEEP_DAYS * 864e5).toISOString(), TRACK_LIMIT);
for (const id of recent) seen.add(Number(id));
const ids = [...seen].slice(0, TRACK_LIMIT);
console.log(`  tracking ${ids.length} games (${recent.length} carried over)`);

// 3. Details and votes
const info = await details(ids);
const vote = await votes(ids);

const games = [];
const snapshots = [];
for (const id of ids) {
  const g = info.get(id);
  if (!g) continue; // removed or private
  const v = vote.get(id);
  games.push({
    universe_id: id, root_place_id: g.rootPlaceId ?? null, name: g.name,
    creator_id: g.creator?.id ?? null, creator_name: g.creator?.name ?? null, creator_type: g.creator?.type ?? null,
    genre_l1: g.genre_l1 ?? null, genre_l2: g.genre_l2 ?? null, created: g.created ?? null, updated: g.updated ?? null, last_seen: ts,
  });
  snapshots.push({
    universe_id: id, ts, playing: g.playing ?? 0, visits: g.visits ?? null, favorites: g.favoritedCount ?? null,
    up_votes: v?.upVotes ?? null, down_votes: v?.downVotes ?? null, updated: g.updated ?? null,
  });
}
const known = new Set(games.map((g) => g.universe_id));

await store.save({ games, snapshots, charts: charts.filter((c) => known.has(c.universe_id)) });
console.log(`Saved ${snapshots.length} snapshots at ${ts}`);
