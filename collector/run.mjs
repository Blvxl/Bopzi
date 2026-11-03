// One collection run.
//   npm run collect                   tick and discover together
//   node collector/run.mjs tick       refresh the players in the known games and save the total (run every few minutes)
//   node collector/run.mjs discover   search for games that are on no list and remember them (run now and then)
// Without SUPABASE_SERVICE_ROLE_KEY it saves to data/bopzi.sqlite, so it can be tried with no setup.
import { chart, details, votes, search, groups, SORTS, WORDS } from './roblox.mjs';
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
// Player counts worth announcing when a game climbs past them.
const MILESTONES = [1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const NEW_HIGH_BY = 1.05;
// "Just gained": at least this many more players than about ten minutes ago, and a real share of what the game had.
const SURGE_AGO_MIN = 7;
const SURGE_AGO_MAX = 13;
const SURGE_GAIN = 500;
const SURGE_SHARE = 0.12;
const SURGE_BIG_GAIN = 5_000;
const SURGE_BIG_SHARE = 0.03;
const SURGE_REPEAT_MIN = 30;
// "On pace": climbing steadily and about to pass a round number.
const FORECAST_GAIN = 300;
const FORECAST_SHARE = 0.04;
const FORECAST_FROM = 2_500;
const FORECAST_MIN = 5;
const FORECAST_MAX = 45;
// "Comeback": busy now, and at most a quarter as busy at any time in the day before.
const COMEBACK_FROM = 2_000;
const COMEBACK_RATIO = 0.25;
const COMEBACK_OLD_DAYS = 7;
// "Crash alert": lost a third or more of a big game's players within about ten minutes, and the last count agrees.
const CRASH_FROM = 3_000;
const CRASH_DROP = 1_500;
const CRASH_SHARE = 0.35;
// "Update impact": how many players an update brought (or cost), looked at 30 to 75 minutes after it.
const IMPACT_AFTER_MIN = 30;
const IMPACT_AFTER_MAX = 75;
const NEW_HIGH_FROM = 1_000;
// A game this young, already this busy, is worth a line of its own.
const NEW_GAME_DAYS = 3;
const NEW_GAME_FROM = 500;
const UPDATE_FROM = 2_000;

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
const gameRow = (g, vote, playing = g.playing ?? 0) => ({
  universe_id: g.id, root_place_id: g.rootPlaceId ?? null, name: g.name,
  creator_id: g.creator?.id ?? null, creator_name: g.creator?.name ?? null, creator_type: g.creator?.type ?? null,
  genre_l1: g.genre_l1 ?? null, genre_l2: g.genre_l2 ?? null, created: g.created ?? null, updated: g.updated ?? null, last_seen: ts, playing,
  description: g.description ? String(g.description).slice(0, 1000) : null, max_players: g.maxPlayers ?? null, price: g.price ?? null,
  avatar_type: g.universeAvatarType ?? null, creator_verified: g.creator?.hasVerifiedBadge ? 1 : 0,
  visits: g.visits ?? null, favorites: g.favoritedCount ?? null, up_votes: vote?.upVotes ?? null, down_votes: vote?.downVotes ?? null, peak: playing,
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
    description: null, max_players: null, price: null, avatar_type: null, creator_verified: null, visits: null, favorites: null, up_votes: g.upVotes ?? null, down_votes: g.downVotes ?? null, peak: g.playing,
  }));
  await store.save({ games: rows });
  // Who is behind the games: groups are looked up once a day, a few hundred at a time, busiest studios first.
  const stale = await store.staleGroups(new Date(now - 864e5).toISOString(), 300);
  if (stale.length) {
    const found = await groups(stale, Date.now() + 40_000);
    await store.save({ creators: [...found.values()].map((g) => ({
      creator_id: g.id, type: 'Group', name: g.name ?? null, description: g.description ? String(g.description).slice(0, 600) : null,
      owner_id: g.owner?.id ?? null, owner_type: g.owner?.type ?? null, created: g.created ?? null, verified: g.hasVerifiedBadge ? 1 : 0, checked: ts,
    })) });
    console.log(`  looked up ${found.size} of ${stale.length} groups`);
  }
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
const firstSeen = new Map();
const lastUpdated = new Map();
const genreOf = new Map();
const peakOf = new Map();
for (const g of tracked) {
  const id = Number(g.id);
  firstSeen.set(id, g.firstSeen ?? ''); lastUpdated.set(id, g.updated ?? null); genreOf.set(id, g.genre ?? null); peakOf.set(id, g.peak ?? null);
  if (!onChart.has(id)) stored.set(id, g.playing);
}
const prevTotal = await store.lastTotalTs();
// How many players each game had about ten minutes ago (the latest saved count inside that window).
const ago = new Map();
for (const r of await store.playersBetween(new Date(now - SURGE_AGO_MAX * 6e4).toISOString(), new Date(now - SURGE_AGO_MIN * 6e4).toISOString())) ago.set(Number(r.universe_id), { playing: r.playing, ts: r.ts });
const recentSurge = new Set((await store.recentEvents(new Date(now - SURGE_REPEAT_MIN * 6e4).toISOString())).filter((e) => e.kind === 'surge').map((e) => e.universe_id));
const recentCrash = new Set((await store.recentEvents(new Date(now - 36e5).toISOString())).filter((e) => e.kind === 'crash').map((e) => e.universe_id));
// The busiest each game was between 26 and 2 hours ago, for spotting a game that has come back.
const quiet = new Map((await store.quietBefore(new Date(now - 26 * 36e5).toISOString(), new Date(now - 2 * 36e5).toISOString())).map((r) => [Number(r.universe_id), r]));
const recentHigh = new Set((await store.recentEvents(new Date(now - 36e5).toISOString())).filter((e) => e.kind === 'new_high').map((e) => e.universe_id));
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
const updates = [];
const events = [];
const byGenre = new Map();
let players = 0;
let active = 0;
// Players in games Bopzi did not know at the previous total. Without this the line would climb whenever more games are found.
let added = 0;
for (const [id, was] of stored) {
  const g = info.get(id);
  const playing = g ? (g.playing ?? 0) : (was ?? 0);
  players += playing;
  if (playing > 0) active++;
  if (prevTotal && !(firstSeen.get(id) <= prevTotal)) added += playing;
  // Players by genre, using the genre Roblox gave (or the one stored); games whose genre is not known yet are counted as Unknown.
  if (playing > 0) {
    const genre = g?.genre_l1 ?? genreOf.get(id) ?? 'Unknown';
    const t = byGenre.get(genre) ?? { players: 0, games: 0 };
    t.players += playing; t.games++; byGenre.set(genre, t);
  }
  if (!g) continue; // not looked up this time: the stored row is already right
  const v = vote.get(id);
  games.push(gameRow(g, v));
  // An update shows up as a new "updated" time on a game whose earlier one is known.
  const before = lastUpdated.get(id);
  if (g.updated && before && before !== g.updated) {
    updates.push({ universe_id: id, updated_at: g.updated, seen_at: ts });
    // Only a fresh update is news; one first noticed hours late is not.
    if (playing >= UPDATE_FROM && now - new Date(g.updated) < 3 * 36e5) events.push({ ts, universe_id: id, kind: 'update', value: playing, prev: null, detail: g.updated, key: `u:${g.updated}` });
  }
  // The live feed: a game passing a round number, beating its own best, or arriving new and busy.
  if (was != null) {
    const hit = MILESTONES.filter((t) => was < t && playing >= t).pop();
    if (hit) events.push({ ts, universe_id: id, kind: 'milestone', value: hit, prev: was, detail: null, key: `m:${hit}:${ts.slice(0, 10)}` });
    const best = peakOf.get(id);
    if (!hit && best != null && best >= NEW_HIGH_FROM && playing >= best * NEW_HIGH_BY && !recentHigh.has(id)) events.push({ ts, universe_id: id, kind: 'new_high', value: playing, prev: best, detail: null, key: `h:${ts}` });
  }
  const then = ago.get(id);
  if (then && then.playing > 0 && !recentSurge.has(id)) {
    const gain = playing - then.playing, share = gain / then.playing;
    if ((gain >= SURGE_GAIN && share >= SURGE_SHARE) || (gain >= SURGE_BIG_GAIN && share >= SURGE_BIG_SHARE)) {
      const minutes = Math.max(1, Math.round((now - new Date(then.ts)) / 6e4));
      events.push({ ts, universe_id: id, kind: 'surge', value: gain, prev: then.playing, detail: String(minutes), key: `s:${ts}` });
    }
  }
  if (then && then.playing > 0) {
    const minutes = Math.max(1, Math.round((now - new Date(then.ts)) / 6e4)), gain = playing - then.playing;
    // On pace for the next round number: a steady climb, and the number is close enough to be worth saying.
    if (gain >= FORECAST_GAIN && gain / then.playing >= FORECAST_SHARE && playing >= FORECAST_FROM) {
      const next = MILESTONES.find((t) => t > playing);
      const soon = next ? Math.round((next - playing) / (gain / minutes)) : 0;
      if (next && soon >= FORECAST_MIN && soon <= FORECAST_MAX) events.push({ ts, universe_id: id, kind: 'forecast', value: next, prev: playing, detail: String(soon), key: `f:${next}:${ts.slice(0, 10)}` });
    }
    // A big game that lost a third of its players, confirmed by the count before this one, so one bad reading does not raise the alarm.
    const lost = then.playing - playing;
    if (then.playing >= CRASH_FROM && lost >= CRASH_DROP && lost / then.playing >= CRASH_SHARE && was != null && was <= then.playing * (1 - CRASH_SHARE) && !recentCrash.has(id)) {
      events.push({ ts, universe_id: id, kind: 'crash', value: Math.round((lost / then.playing) * 100), prev: then.playing, detail: String(minutes), key: `x:${ts}` });
    }
  }
  // Back from the quiet: plenty of players now, and at most a quarter as many at any point the day before, for a game that is not new.
  const calm = quiet.get(id);
  if (calm && calm.n >= 4 && playing >= COMEBACK_FROM && calm.top <= playing * COMEBACK_RATIO && g.created && now - new Date(g.created) > COMEBACK_OLD_DAYS * 864e5) {
    events.push({ ts, universe_id: id, kind: 'comeback', value: playing, prev: calm.top, detail: null, key: `c:${ts.slice(0, 10)}` });
  }
  if (g.created && now - new Date(g.created) < NEW_GAME_DAYS * 864e5 && playing >= NEW_GAME_FROM) events.push({ ts, universe_id: id, kind: 'new_game', value: playing, prev: null, detail: g.created, key: 'n' });
  // Busy games are saved every five minutes, the long tail once an hour. The total covers everyone, every run.
  if (writeRows && (playing >= SNAPSHOT_FROM || hourly || onChart.has(id))) {
    snapshots.push({
      universe_id: id, ts, playing, visits: g.visits ?? null, favorites: g.favoritedCount ?? null,
      up_votes: v?.upVotes ?? null, down_votes: v?.downVotes ?? null, updated: g.updated ?? null,
    });
  }
}
// What an update did: a game that updated 30 to 75 minutes ago, compared with how many players it had just before.
for (const u of await store.updatesBetween(new Date(now - IMPACT_AFTER_MAX * 6e4).toISOString(), new Date(now - IMPACT_AFTER_MIN * 6e4).toISOString())) {
  const id = Number(u.universe_id);
  const before = await store.playerAt(id, u.updated_at);
  const nowPlaying = info.get(id)?.playing ?? stored.get(id);
  if (!before || nowPlaying == null) continue;
  const gain = nowPlaying - before, share = gain / before;
  if ((gain >= 500 && share >= 0.2) || (gain <= -3000 && share <= -0.4)) events.push({ ts, universe_id: id, kind: 'impact', value: gain, prev: before, detail: String(Math.round(share * 100)), key: `ui:${u.updated_at}` });
}
const known = new Set(games.map((g) => g.universe_id));

await store.save({ games, snapshots, charts: writeRows ? charts.filter((c) => known.has(c.universe_id)) : [], totals: [{ ts, players, games: active, added }], updates, events, genres: [...byGenre].map(([genre, t]) => ({ ts, genre, players: t.players, games: t.games })) });
console.log(`Saved total ${players.toLocaleString('en-US')} players in ${active} games, ${added.toLocaleString('en-US')} of them in newly found games (${info.size} looked up, ${snapshots.length} game rows) at ${ts}`);
