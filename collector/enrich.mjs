// Jobs that add to what the collector knows, each on its own schedule:
//   node collector/enrich.mjs tags       read names and descriptions: types, themes, features, brands, paid extras, language
//   node collector/enrich.mjs looks      look at each busy game's icon and note its colours
//   node collector/enrich.mjs searches   read Roblox's search suggestions, the closest thing to "what players search for"
//   node collector/enrich.mjs events     ask Roblox which events (updates, parties) the busiest games have scheduled
//   node collector/enrich.mjs all        all four
// They work on the local database (data/bopzi.sqlite).
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { openSqlite } from './store-sqlite.mjs';
import { tag } from './tagger.mjs';

const mode = process.argv[2] ?? 'all';
const store = openSqlite();
const db = store.db;
const now = new Date();
const ts = now.toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const txn = (fn) => { db.exec('begin'); try { fn(); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; } };

/** A busy game is one with at least this many players now or at its best. */
const BUSY = 200;

async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'bopzi-collector/1.0 (+https://bopzi.dev)' }, signal: AbortSignal.timeout(25_000) }).catch(() => null);
    if (res?.ok) return res.json();
    if (res && res.status !== 429 && res.status < 500) return null;
    await sleep(Math.min(2000 * 2 ** i, 20_000));
  }
  return null;
}

// ---- tags -------------------------------------------------------------------------------------------------------------
async function tags() {
  const rows = db.prepare(`SELECT g.universe_id AS id, g.name, g.description AS d, s.hash FROM games g LEFT JOIN tag_state s ON s.universe_id = g.universe_id
    WHERE g.playing >= ? OR g.peak >= ?`).all(BUSY, BUSY);
  const clear = db.prepare('DELETE FROM game_tags WHERE universe_id = ?');
  const add = db.prepare('INSERT OR IGNORE INTO game_tags VALUES (?, ?, ?)');
  const state = db.prepare('INSERT OR REPLACE INTO tag_state VALUES (?, ?, ?)');
  let done = 0;
  txn(() => {
    for (const r of rows) {
      const hash = createHash('sha1').update(`${r.name}\n${r.d ?? ''}`).digest('hex').slice(0, 16);
      if (r.hash === hash) continue; // nothing changed since it was last read
      clear.run(r.id);
      for (const [kind, list] of Object.entries(tag(r.name, r.d))) for (const t of list) add.run(r.id, kind, t);
      state.run(r.id, hash, ts);
      done++;
    }
  });
  console.log(`tags: read ${done} of ${rows.length} busy games`);
}

// ---- looks ------------------------------------------------------------------------------------------------------------
function look(rgb) {
  let v = 0, s = 0, x = 0, y = 0;
  const n = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i] / 255, g = rgb[i + 1] / 255, b = rgb[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    v += max; s += max ? d / max : 0;
    if (d) {
      const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
      const w = (d / max) * max; // strong, bright colours count most
      x += Math.cos((h * Math.PI) / 180) * w; y += Math.sin((h * Math.PI) / 180) * w;
    }
  }
  v /= n; s /= n;
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const name = v < 0.36 ? 'Dark & moody' : s < 0.32 && v > 0.62 ? 'Light & soft' : s > 0.6 && v > 0.55 ? 'Vivid'
    : hue < 70 || hue >= 330 ? 'Warm' : hue < 170 ? 'Green' : hue < 290 ? 'Cool' : 'Muted';
  return { name, brightness: v, saturation: s, hue };
}

async function looks() {
  const todo = db.prepare(`SELECT g.universe_id AS id FROM games g LEFT JOIN game_looks l ON l.universe_id = g.universe_id
    WHERE (g.playing >= ? OR g.peak >= ?) AND l.universe_id IS NULL ORDER BY g.playing DESC LIMIT 250`).all(BUSY, BUSY).map((r) => r.id);
  const save = db.prepare('INSERT OR REPLACE INTO game_looks VALUES (?, ?, ?, ?, ?, ?)');
  let done = 0;
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const body = await getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${part.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`);
    for (const d of body?.data ?? []) {
      if (!d.imageUrl || d.state !== 'Completed') continue;
      try {
        const buf = Buffer.from(await (await fetch(d.imageUrl, { signal: AbortSignal.timeout(25_000) })).arrayBuffer());
        const raw = await sharp(buf).resize(16, 16, { fit: 'cover' }).removeAlpha().raw().toBuffer();
        const l = look(raw);
        save.run(d.targetId, l.name, l.brightness, l.saturation, l.hue, ts);
        done++;
      } catch { /* a bad image is skipped and tried again next time */ }
    }
    await sleep(400);
  }
  console.log(`looks: ${done} icons read (${todo.length} were due)`);
}

// ---- searches ---------------------------------------------------------------------------------------------------------
async function searches() {
  const seen = new Map(); // query -> { best rank, how many prefixes, trending }
  const prefixes = [...'abcdefghijklmnopqrstuvwxyz'];
  for (const prefix of prefixes) {
    const body = await getJson(`https://apis.roblox.com/games-autocomplete/v1/get-suggestion/${encodeURIComponent(prefix)}?sessionId=${crypto.randomUUID()}`);
    (body?.entries ?? []).forEach((e, i) => {
      if (!e.searchQuery) return;
      const q = e.searchQuery.toLowerCase();
      const o = seen.get(q) ?? { rank: i + 1, n: 0, trending: false };
      o.rank = Math.min(o.rank, i + 1); o.n++; o.trending ||= !!e.trendingSearchStartDateTime;
      seen.set(q, o);
    });
    await sleep(300);
  }
  // Roblox orders suggestions only within one letter, so the letters cannot be compared with each other. The top three for every
  // letter are kept and then ranked by how many players are in the games each search is really about.
  const ranked = [...seen].filter(([, o]) => o.rank <= 3 || o.trending).slice(0, 110);
  const add = db.prepare('INSERT OR REPLACE INTO search_terms VALUES (?, ?, ?, ?, ?)');
  const rows = [];
  let place = 0; // set properly once the players are known
  for (const [query, o] of ranked) {
    // How many people are in the games that search finds, the same way a search page shows them.
    const body = await getJson(`https://apis.roblox.com/search-api/omni-search?${new URLSearchParams({ searchQuery: query, sessionId: crypto.randomUUID(), pageType: 'all' })}`);
    // Only games whose name contains every word of the search count, so a search is sized by the games it is really about and not by
    // the popular games Roblox pads the results with.
    const words = query.split(/s+/).filter(Boolean);
    const players = (body?.searchResults ?? []).flatMap((g) => g.contents ?? []).filter((c) => words.every((w) => (c.name ?? '').toLowerCase().includes(w))).reduce((a, c) => a + (c.playerCount ?? 0), 0);
    rows.push([ts, query, ++place, o.trending ? 1 : 0, players]);
    await sleep(250);
  }
  rows.sort((a, b) => b[4] - a[4]).forEach((r, i) => { r[2] = i + 1; });
  txn(() => { for (const r of rows) add.run(...r); });
  console.log(`searches: ${seen.size} suggestions read, top ${rows.length} saved`);
}

// ---- events -----------------------------------------------------------------------------------------------------------
async function events() {
  // The busiest games whose events have not been asked about for the longest.
  const todo = db.prepare(`SELECT g.universe_id AS id FROM games g LEFT JOIN event_checks c ON c.universe_id = g.universe_id
    WHERE g.playing >= 300 ORDER BY c.ts IS NOT NULL, c.ts, g.playing DESC LIMIT 100`).all().map((r) => r.id);
  const addEvent = db.prepare('INSERT OR REPLACE INTO game_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const check = db.prepare('INSERT OR REPLACE INTO event_checks VALUES (?, ?)');
  let found = 0, asked = 0;
  for (const id of todo) {
    const body = await getJson(`https://apis.roblox.com/virtual-events/v1/universes/${id}/virtual-events`, 3);
    if (!body) { await sleep(1500); continue; }
    asked++;
    txn(() => {
      for (const e of body.data ?? []) {
        addEvent.run(id, String(e.id), e.displayTitle ?? e.title ?? null, (e.displayDescription ?? e.description ?? '').slice(0, 400), e.eventTime?.startUtc ?? null, e.eventTime?.endUtc ?? null, e.eventStatus ?? null, ts);
        found++;
      }
      check.run(id, ts);
    });
    await sleep(380);
  }
  console.log(`events: asked about ${asked} games, ${found} events saved`);
}

const jobs = { tags, looks, searches, events };
for (const name of mode === 'all' ? Object.keys(jobs) : [mode]) {
  if (!jobs[name]) { console.error(`unknown job "${name}"`); process.exit(1); }
  await jobs[name]();
}
