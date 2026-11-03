// One collection run.
//   npm run collect                   tick and discover together
//   node collector/run.mjs tick       refresh the players in the known games and save the total (run every few minutes)
//   node collector/run.mjs discover   search for games that are on no list and remember them (run now and then)
// Without SUPABASE_SERVICE_ROLE_KEY it saves to data/bopzi.sqlite, so it can be tried with no setup.
import { chart, details, votes, search, SORTS, WORDS } from './roblox.mjs';
import { openSqlite } from './store-sqlite.mjs';
import { openSupabase } from './store-supabase.mjs';

const mode = process.argv[2] ?? process.env.BOPZI_MODE ?? 'both';
const TICK = mode !== 'discover';
const DISCOVER = mode !== 'tick';

const TRACK_LIMIT = Number(process.env.BOPZI_TRACK_LIMIT ?? 40000);
// Search finds games that are on no list; some words per run, rotating, so the set of known games keeps growing.
const WORDS_PER_RUN = Number(process.env.BOPZI_WORDS_PER_RUN ?? 20);
const SEARCH_PAGES = Number(process.env.BOPZI_SEARCH_PAGES ?? 5);
// A word already searched is left alone for this many days.
const SEARCH_AGAIN_DAYS = 3;
// Roblox lets only a few dozen lookups through a minute, so a tick cannot look up every game. Busy games are looked up every tick,
// quieter ones every few ticks, and the total uses the last count seen for the ones skipped. The tick stops looking up after this long.
const TICK_BUDGET_MS = Number(process.env.BOPZI_TICK_BUDGET_MS ?? 150_000);
const BUSY = 500;
const MID = 50;
const MID_EVERY = 3;
const QUIET_EVERY = 12;
// Per-game rows are saved at most every five minutes, and only for games at least this busy; the rest once an hour.
const SNAPSHOT_FROM = 500;
const SNAPSHOT_EVERY = 5 * 60e3;
const KEEP_DAYS = 7;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const store = url && key ? openSupabase(url, key) : openSqlite();

const now = new Date();
const ts = now.toISOString();
const sessionId = crypto.randomUUID();

console.log(`Bopzi collector (${mode}) -> ${store.kind}`);

/**
 * What to search for next. A search only shows the few hundred most popular matches, so the same few words keep finding the same
 * big games. Small games are found by asking about things only they have: their creators' names and the unusual words in their names.
 * First the fixed word list, then creators and name words taken from the games already known (which turns up their neighbours).
 */
async function nextQueries(done, count) {
  const picks = WORDS.filter((w) => !done.has(w)).slice(0, Math.ceil(count / 3));
  const terms = await store.sampleTerms(count * 12);
  const tokens = new Map();
  for (const name of terms.names) for (const t of name.toLowerCase().split(/[^a-z]+/)) if (t.length >= 4 && t.length <= 14) tokens.set(t, (tokens.get(t) ?? 0) + 1);
  // Words that appear in many names are common ("simulator"); the unusual ones lead to games nobody has listed.
  const rare = [...tokens].filter(([, n]) => n <= 2).map(([t]) => t);
  const pool = [];
  for (let i = 0; i < Math.max(terms.creators.length, rare.length); i++) { if (terms.creators[i]) pool.push(terms.creators[i]); if (rare[i]) pool.push(rare[i]); }
  for (const q of pool) { if (picks.length >= count) break; if (!done.has(q) && !picks.includes(q)) picks.push(q); }
  return picks;
}

/** A games row from Roblox's game details. */
const gameRow = (g, playing = g.playing ?? 0) => ({
  universe_id: g.id, root_place_id: g.rootPlaceId ?? null, name: g.name,
  creator_id: g.creator?.id ?? null, creator_name: g.creator?.name ?? null, creator_type: g.creator?.type ?? null,
  genre_l1: g.genre_l1 ?? null, genre_l2: g.genre_l2 ?? null, created: g.created ?? null, updated: g.updated ?? null, last_seen: ts, playing,
});

// Discover: search for games the collector does not know yet. The results already say how many are playing, so no lookup is needed.
if (DISCOVER) {
  const known = new Set((await store.knownIds()).map(Number));
  const done = new Set(await store.searchedSince(new Date(now - SEARCH_AGAIN_DAYS * 864e5).toISOString()));
  const words = await nextQueries(done, WORDS_PER_RUN);
  const fresh = new Map();
  const asked = [];
  for (const word of words) {
    try {
      let added = 0;
      for (const g of await search(word, sessionId, SEARCH_PAGES)) if (!known.has(g.universeId) && g.playing > 0 && !fresh.has(g.universeId)) { fresh.set(g.universeId, g); added++; }
      asked.push({ query: word, ts, found: added });
    } catch (e) { console.log(`  search "${word}" skipped: ${e.message}`); }
  }
  await store.markSearched(asked);
  const rows = [...fresh.values()].map((g) => ({
    universe_id: g.universeId, root_place_id: g.rootPlaceId, name: g.name, creator_id: g.creatorId, creator_name: g.creatorName, creator_type: null,
    genre_l1: null, genre_l2: null, created: null, updated: null, last_seen: ts, playing: g.playing,
  }));
  await store.save({ games: rows, snapshots: [], charts: [], totals: [] });
  const best = asked.sort((a, b) => b.found - a.found).slice(0, 3).map((a) => `${a.query} +${a.found}`).join(', ');
  console.log(`  search: ${words.length} queries, ${rows.length} new games with players (best: ${best})`);
  if (!TICK) process.exit(0);
}

// Tick 1. Roblox's own lists
const charts = [];
const stored = new Map();
for (const sortId of SORTS) {
  const list = await chart(sortId, sessionId);
  console.log(`  ${sortId}: ${list.length} games`);
  for (const g of list) {
    charts.push({ ts, sort_id: sortId, rank: g.rank, universe_id: g.universeId });
    stored.set(g.universeId, g.playing ?? null);
  }
}
const onChart = new Set(stored.keys());

// Tick 2. Every game seen in the last week, with the player count last seen
const tracked = await store.trackedGames(new Date(now - KEEP_DAYS * 864e5).toISOString(), new Date(now - 864e5).toISOString(), TRACK_LIMIT);
for (const g of tracked) { const id = Number(g.id); if (!onChart.has(id)) stored.set(id, g.playing); }
const tick = Math.floor(now.getTime() / 18e4);

// Tick 3. Which games are due for a lookup now: the busy ones and the unknown ones always, the rest in turns. Busiest first.
const due = [...stored.entries()]
  .filter(([id, playing]) => onChart.has(id) || playing == null || playing >= BUSY || (playing >= MID ? (id + tick) % MID_EVERY === 0 : (id + tick) % QUIET_EVERY === 0))
  .sort((a, b) => (b[1] ?? Infinity) - (a[1] ?? Infinity))
  .map(([id]) => id);
console.log(`  tracking ${stored.size} games, looking up ${due.length} of them`);

const deadline = Date.now() + TICK_BUDGET_MS;
const info = await details(due, deadline);
const missed = due.length - info.size;
if (missed > 0) console.log(`  ran out of time for ${missed} lookups; their last counts are used`);

// Tick 4. The total: the fresh count where there is one, the last count seen where there is not.
const lastSnap = await store.lastSnapshotTs();
const slot = Math.floor(now.getTime() / SNAPSHOT_EVERY);
const writeRows = !lastSnap || Math.floor(new Date(lastSnap).getTime() / SNAPSHOT_EVERY) < slot;
const hourly = writeRows && slot % 12 === 0;
const vote = writeRows ? await votes([...info.values()].filter((g) => (g.playing ?? 0) >= BUSY && hourly).map((g) => g.id), deadline) : new Map();

const games = [];
const snapshots = [];
let players = 0;
let active = 0;
for (const [id, was] of stored) {
  const g = info.get(id);
  const playing = g ? (g.playing ?? 0) : (was ?? 0);
  players += playing;
  if (playing > 0) active++;
  if (!g) continue; // not looked up this time: the stored row is already right
  games.push(gameRow(g));
  // Busy games are saved every five minutes, the long tail once an hour. The total covers everyone, every run.
  if (writeRows && (playing >= SNAPSHOT_FROM || hourly || onChart.has(id))) {
    const v = vote.get(id);
    snapshots.push({
      universe_id: id, ts, playing, visits: g.visits ?? null, favorites: g.favoritedCount ?? null,
      up_votes: v?.upVotes ?? null, down_votes: v?.downVotes ?? null, updated: g.updated ?? null,
    });
  }
}
const known = new Set(games.map((g) => g.universe_id));

await store.save({ games, snapshots, charts: writeRows ? charts.filter((c) => known.has(c.universe_id)) : [], totals: [{ ts, players, games: active }] });
console.log(`Saved total ${players.toLocaleString('en-US')} players in ${active} games (${info.size} looked up, ${snapshots.length} game rows) at ${ts}`);
