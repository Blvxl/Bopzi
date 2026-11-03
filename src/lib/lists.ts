import type { DatabaseSync } from 'node:sqlite';
import { icons } from './icons';

/** One line of a list. `value` is what the list ranks by; `change` is growth against the reference time, when there is one. */
export type ListRow = { key: string; name: string; sub?: string; icon?: string | null; value: number; valueText?: string; change?: number | null; href?: string };
export type ListResult = { slug: string; title: string; note: string; valueLabel: string; windowHours: number | null; rows: ListRow[] };

export const LISTS = [
  { slug: 'words', title: 'Words taking off', blurb: 'Words in game names whose games grew the most' },
  { slug: 'updates', title: 'Biggest updates', blurb: 'Updates that brought the most players' },
  { slug: 'hands', title: 'Changes of hands', blurb: 'Games that moved to a new owner' },
  { slug: 'new-highs', title: 'Games at a new high', blurb: 'Games beating their own best' },
  { slug: 'new-games', title: 'Top new games', blurb: 'Games under a week old with the most players' },
  { slug: 'genres', title: 'Genres gaining players', blurb: 'Roblox genres, by players and growth' },
  { slug: 'types', title: 'Game types', blurb: 'What players do: tycoon, obby, tower defense' },
  { slug: 'themes', title: 'Themes', blurb: 'What games are about: anime, cars, Halloween' },
  { slug: 'features', title: 'Features', blurb: 'What games have in them: trading, rebirths, pets' },
  { slug: 'brands', title: 'Brands', blurb: 'Shows and brands that games are built on' },
  { slug: 'extras', title: 'Paid extras', blurb: 'What games sell: VIP, private servers, battle passes' },
  { slug: 'languages', title: 'Languages', blurb: 'The language games are written in' },
  { slug: 'looks', title: 'Icon colours', blurb: 'The colour mood of the icons players click' },
  { slug: 'searches', title: 'Most searched', blurb: 'What players are typing into Roblox search' },
  { slug: 'events', title: 'Events on now', blurb: 'Games with a Roblox event running' },
  { slug: 'calendar', title: 'Calendar', blurb: 'Events and updates, day by day' },
  { slug: 'earners', title: 'Top earners', blurb: 'Studios by estimated Robux a month' },
] as const;

const TAG_LISTS: Record<string, { kind: string; title: string; note: string }> = {
  types: { kind: 'type', title: 'Game types', note: 'What players do. Read from each game\'s name and description by matching words, so a game can have several types and some are missed; games with 200+ players. Players now, and how they changed since the reference time.' },
  themes: { kind: 'theme', title: 'Themes', note: 'What games are about. Read from each game\'s name and description by matching words (games with 200+ players). A game can have several themes.' },
  features: { kind: 'feature', title: 'Features', note: 'What games say they have in them. Read from names and descriptions by matching words (games with 200+ players).' },
  brands: { kind: 'brand', title: 'Brands', note: 'Shows, franchises and big games that other games are built on, found by name in titles and descriptions (games with 200+ players). A short list of known names, so smaller brands are missing.' },
  extras: { kind: 'extra', title: 'Paid extras', note: 'What games mention selling: VIP, private servers, passes, boosts. Read from descriptions only, so it shows what games advertise, not what they sell.' },
  languages: { kind: 'language', title: 'Languages', note: 'The language the name and description are written in (games with 200+ players). A guess from the words used; short text is left out.' },
};

/** About five Robux are spent per player-hour across Roblox (public yearly bookings and hours, rounded). The same for every game. */
const ROBUX_PER_PLAYER_HOUR = 5;
const HOURS_PER_MONTH = 730;
const DAY = 864e5;

type Db = DatabaseSync;
const q = <T>(db: Db, sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as T[];
const hasTable = (db: Db, name: string) => (q(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name)).length > 0;

/** How many players each game had about a day ago (or at the start of the history, if that is shorter), to measure growth against. */
function then(db: Db) {
  const last = (db.prepare('SELECT MAX(ts) AS t, MIN(ts) AS a FROM snapshots').get() as { t: string | null; a: string | null });
  if (!last.t || !last.a) return { map: new Map<number, number>(), hours: 0 };
  const ref = Math.max(new Date(last.a).getTime(), new Date(last.t).getTime() - DAY);
  const rows = q<{ universe_id: number; playing: number; ts: string }>(db, 'SELECT universe_id, playing, ts FROM snapshots WHERE ts BETWEEN ? AND ?', new Date(ref - 60 * 6e4).toISOString(), new Date(ref + 60 * 6e4).toISOString());
  const best = new Map<number, { playing: number; gap: number }>();
  for (const r of rows) {
    const gap = Math.abs(new Date(r.ts).getTime() - ref);
    const b = best.get(r.universe_id);
    if (!b || gap < b.gap) best.set(r.universe_id, { playing: r.playing, gap });
  }
  return { map: new Map([...best].map(([id, v]) => [id, v.playing])), hours: Math.round(((new Date(last.t).getTime() - ref) / 36e5) * 10) / 10 };
}

/** Totals per label over games, now against the same games then, so a label is not "growing" just because more games were found. */
function byLabel(db: Db, kind: string, ref: Map<number, number>) {
  const rows = q<{ tag: string; id: number; playing: number }>(db, 'SELECT t.tag, g.universe_id AS id, COALESCE(g.playing, 0) AS playing FROM game_tags t JOIN games g ON g.universe_id = t.universe_id WHERE t.kind = ? AND g.playing > 0', kind);
  const acc = new Map<string, { now: number; games: number; nowSame: number; thenSame: number }>();
  for (const r of rows) {
    const a = acc.get(r.tag) ?? { now: 0, games: 0, nowSame: 0, thenSame: 0 };
    a.now += r.playing; a.games++;
    const was = ref.get(r.id);
    if (was != null) { a.nowSame += r.playing; a.thenSame += was; }
    acc.set(r.tag, a);
  }
  return [...acc].map(([tag, a]) => ({ key: tag, name: tag, value: a.now, games: a.games, change: a.thenSame > 200 ? a.nowSame / a.thenSame - 1 : null }));
}

const gameIcons = async (rows: (ListRow & { id?: number })[]) => {
  const ids = rows.map((r) => r.id).filter((n): n is number => !!n);
  if (!ids.length) return rows;
  const icon = await icons(ids);
  return rows.map(({ id, ...r }) => ({ ...r, icon: id ? icon(id) : r.icon ?? null }));
};

const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const STOP = new Set('the and for with new update upd roblox game games obby simulator tycoon from your you are all out not of in on to a an at by is it my me we our'.split(' '));

export async function buildList(db: Db, slug: string): Promise<ListResult | null> {
  const meta = LISTS.find((l) => l.slug === slug);
  if (!meta) return null;
  const base = { slug, title: meta.title, windowHours: null as number | null };
  const ref = then(db);
  const withWindow = { ...base, windowHours: ref.hours };

  if (TAG_LISTS[slug]) {
    const t = TAG_LISTS[slug];
    if (!hasTable(db, 'game_tags')) return { ...withWindow, note: t.note, valueLabel: 'Players', rows: [] };
    const rows = byLabel(db, t.kind, ref.map).sort((a, b) => b.value - a.value).slice(0, 60)
      .map((r): ListRow => ({ key: r.key, name: r.name, sub: `${r.games.toLocaleString('en-US')} games`, value: r.value, change: r.change }));
    return { ...withWindow, title: t.title, note: t.note, valueLabel: 'Players', rows };
  }

  if (slug === 'words') {
    const games = q<{ id: number; name: string; playing: number }>(db, 'SELECT universe_id AS id, name, playing FROM games WHERE playing >= 50');
    const acc = new Map<string, { now: number; games: number; nowSame: number; thenSame: number }>();
    for (const g of games) {
      for (const w of new Set(g.name.toLowerCase().match(/[a-z]{3,14}/g) ?? [])) {
        if (STOP.has(w)) continue;
        const a = acc.get(w) ?? { now: 0, games: 0, nowSame: 0, thenSame: 0 };
        a.now += g.playing; a.games++;
        const was = ref.map.get(g.id);
        if (was != null) { a.nowSame += g.playing; a.thenSame += was; }
        acc.set(w, a);
      }
    }
    const rows = [...acc].filter(([, a]) => a.games >= 3 && a.thenSame >= 1500 && a.now >= 2000)
      .map(([w, a]): ListRow => ({ key: w, name: w, sub: `${a.games} games`, value: a.now, change: a.nowSame / a.thenSame - 1 }))
      .sort((a, b) => (b.change ?? 0) - (a.change ?? 0)).slice(0, 50);
    return { ...withWindow, note: 'Words in game names whose games grew the most: every game with the word in its name, now against the same games a day ago (games with at least 3 games and 2,000 players).', valueLabel: 'Players', rows };
  }

  if (slug === 'updates') {
    const ups = q<{ id: number; name: string; creator: string | null; detail: string; v: number }>(db, `SELECT e.universe_id AS id, g.name, g.creator_name AS creator, e.detail, e.value AS v FROM events e JOIN games g ON g.universe_id = e.universe_id
      WHERE e.kind = 'update' AND e.ts >= ? ORDER BY e.ts DESC LIMIT 400`, new Date(Date.now() - 7 * DAY).toISOString());
    const avg = db.prepare('SELECT AVG(playing) AS a, COUNT(*) AS n FROM snapshots WHERE universe_id = ? AND ts BETWEEN ? AND ?');
    const rows: ListRow[] = [];
    const seen = new Set<number>();
    for (const u of ups) {
      if (seen.has(u.id)) continue;
      const at = new Date(u.detail).getTime();
      const after = avg.get(u.id, new Date(at + 30 * 6e4).toISOString(), new Date(at + 150 * 6e4).toISOString()) as { a: number | null; n: number };
      if (!after.a || after.n < 2) continue;
      // The same hours the day before, so an evening rush is not credited to the update; if there is no day before yet, the hour before it.
      let before = avg.get(u.id, new Date(at - DAY + 30 * 6e4).toISOString(), new Date(at - DAY + 150 * 6e4).toISOString()) as { a: number | null; n: number };
      if (!before.a || before.n < 2) before = avg.get(u.id, new Date(at - 100 * 6e4).toISOString(), new Date(at - 5 * 6e4).toISOString()) as { a: number | null; n: number };
      if (!before.a) continue;
      seen.add(u.id);
      rows.push({ key: `${u.id}`, name: u.name, id: u.id, sub: `Updated ${ago(u.detail)} · ${Math.round(before.a).toLocaleString('en-US')} before`, value: Math.round(after.a - before.a), change: after.a / before.a - 1 } as ListRow & { id: number });
    }
    rows.sort((a, b) => b.value - a.value);
    return { ...base, note: 'Games whose update in the last week brought the most players: the hours from half an hour to two and a half hours after it, against the same hours the day before (or the hour before the update when there is no day before yet).', valueLabel: 'Players gained', rows: await gameIcons(rows.slice(0, 40)) };
  }

  if (slug === 'hands') {
    const rows = hasTable(db, 'creator_changes') ? q<{ id: number; name: string; playing: number | null; ts: string; fn: string | null; tn: string | null }>(db, `SELECT c.universe_id AS id, g.name, g.playing, c.ts, c.from_name AS fn, c.to_name AS tn
      FROM creator_changes c JOIN games g ON g.universe_id = c.universe_id ORDER BY c.ts DESC LIMIT 60`) : [];
    return { ...base, note: 'Games whose owner, a user or a group, changed since Bopzi first saw them, with at least 100 players. Seen when a game is looked up, so it can be a few minutes late.', valueLabel: 'Players', rows: await gameIcons(rows.map((r) => ({ key: `${r.id}${r.ts}`, id: r.id, name: r.name, sub: `${r.fn ?? 'unknown'} → ${r.tn ?? 'unknown'} · ${ago(r.ts)}`, value: r.playing ?? 0 }) as ListRow & { id: number })) };
  }

  if (slug === 'new-highs') {
    const rows = q<{ id: number; name: string; v: number; p: number | null; ts: string }>(db, `SELECT e.universe_id AS id, g.name, e.value AS v, e.prev AS p, MAX(e.ts) AS ts FROM events e JOIN games g ON g.universe_id = e.universe_id
      WHERE e.kind = 'new_high' AND e.ts >= ? GROUP BY e.universe_id ORDER BY ts DESC LIMIT 60`, new Date(Date.now() - 7 * DAY).toISOString());
    return { ...base, note: 'Games that beat their own best player count in the last week. Bopzi only knows highs since it began tracking.', valueLabel: 'Players', rows: await gameIcons(rows.map((r) => ({ key: String(r.id), id: r.id, name: r.name, sub: `was ${(r.p ?? 0).toLocaleString('en-US')} · ${ago(r.ts)}`, value: r.v, change: r.p ? r.v / r.p - 1 : null }) as ListRow & { id: number })) };
  }

  if (slug === 'new-games') {
    const rows = q<{ id: number; name: string; creator: string | null; playing: number; created: string }>(db, 'SELECT universe_id AS id, name, creator_name AS creator, playing, created FROM games WHERE created >= ? AND playing >= 100 ORDER BY playing DESC LIMIT 60', new Date(Date.now() - 7 * DAY).toISOString());
    return { ...base, note: 'Games created in the last week, by players now.', valueLabel: 'Players', rows: await gameIcons(rows.map((r) => ({ key: String(r.id), id: r.id, name: r.name, sub: `${r.creator ?? 'Roblox experience'} · created ${day(r.created)}`, value: r.playing }) as ListRow & { id: number })) };
  }

  if (slug === 'genres') {
    const last = (db.prepare('SELECT MAX(ts) AS t FROM genre_totals').get() as { t: string | null }).t;
    if (!last) return { ...withWindow, note: 'Waiting for the collector to save genre totals.', valueLabel: 'Players', rows: [] };
    const refTs = (db.prepare('SELECT ts FROM genre_totals WHERE ts <= ? ORDER BY ts DESC LIMIT 1').get(new Date(Math.max(new Date(last).getTime() - DAY, 0)).toISOString()) as { ts: string } | undefined)?.ts
      ?? (db.prepare('SELECT MIN(ts) AS ts FROM genre_totals').get() as { ts: string }).ts;
    const now = q<{ genre: string; players: number; games: number }>(db, 'SELECT genre, players, games FROM genre_totals WHERE ts = ?', last);
    const was = new Map(q<{ genre: string; players: number }>(db, 'SELECT genre, players FROM genre_totals WHERE ts = ?', refTs).map((r) => [r.genre, r.players]));
    const rows = now.filter((r) => r.genre !== 'Unknown').map((r): ListRow => ({ key: r.genre, name: r.genre, sub: `${r.games.toLocaleString('en-US')} games`, value: r.players, change: was.get(r.genre) && was.get(r.genre)! > 1000 ? r.players / was.get(r.genre)! - 1 : null })).sort((a, b) => b.value - a.value);
    return { ...base, windowHours: Math.round(((new Date(last).getTime() - new Date(refTs).getTime()) / 36e5) * 10) / 10, note: 'Roblox\'s own genres: players in all tracked games of each genre, against the earlier total. Games whose genre is not known yet are left out, and the total of games grows as more are found, so growth is rough.', valueLabel: 'Players', rows };
  }

  if (slug === 'looks') {
    if (!hasTable(db, 'game_looks')) return { ...withWindow, note: '', valueLabel: 'Players', rows: [] };
    const rows = q<{ look: string; id: number; playing: number }>(db, 'SELECT l.look, g.universe_id AS id, COALESCE(g.playing, 0) AS playing FROM game_looks l JOIN games g ON g.universe_id = l.universe_id WHERE g.playing > 0');
    const acc = new Map<string, { now: number; games: number; nowSame: number; thenSame: number }>();
    for (const r of rows) {
      const a = acc.get(r.look) ?? { now: 0, games: 0, nowSame: 0, thenSame: 0 };
      a.now += r.playing; a.games++;
      const was = ref.map.get(r.id);
      if (was != null) { a.nowSame += r.playing; a.thenSame += was; }
      acc.set(r.look, a);
    }
    const out = [...acc].map(([look, a]): ListRow => ({ key: look, name: look, sub: `${a.games.toLocaleString('en-US')} games`, value: a.now, change: a.thenSame > 200 ? a.nowSame / a.thenSame - 1 : null })).sort((a, b) => b.value - a.value);
    return { ...withWindow, note: 'The colour mood of each busy game\'s icon, measured from its pixels: dark or light, vivid or muted, warm or cool. This is colour only, not the art style, and it covers the busiest games first.', valueLabel: 'Players', rows: out };
  }

  if (slug === 'searches') {
    if (!hasTable(db, 'search_terms')) return { ...base, note: '', valueLabel: 'Players in matches', rows: [] };
    const last = (db.prepare('SELECT MAX(ts) AS t FROM search_terms').get() as { t: string | null }).t;
    const rows = last ? q<{ query: string; rank: number; trending: number; players: number | null }>(db, 'SELECT query, rank, trending, players FROM search_terms WHERE ts = ? ORDER BY rank', last) : [];
    return { ...base, note: `Roblox's top three search suggestions for every first letter, read from its own search box${last ? ` ${ago(last)}` : ''}, ranked by the players in the games whose name matches the search. Roblox does not publish how many searches there are, so this shows what is suggested and how big the games behind it are, not search counts.`, valueLabel: 'Players in matches',
      rows: rows.map((r): ListRow => ({ key: r.query, name: r.query, sub: r.trending ? 'Trending' : undefined, value: r.players ?? 0 })) };
  }

  if (slug === 'events' || slug === 'calendar') {
    if (!hasTable(db, 'game_events')) return { ...base, note: '', valueLabel: 'Players', rows: [] };
    const nowIso = new Date().toISOString();
    const rows = slug === 'events'
      ? q<{ id: number; name: string; title: string | null; ends: string | null; playing: number | null; starts: string }>(db, `SELECT e.universe_id AS id, g.name, e.title, e.ends, g.playing, e.starts FROM game_events e JOIN games g ON g.universe_id = e.universe_id
          WHERE e.starts <= ? AND (e.ends IS NULL OR e.ends >= ?) ORDER BY g.playing DESC LIMIT 60`, nowIso, nowIso)
      : q<{ id: number; name: string; title: string | null; ends: string | null; playing: number | null; starts: string }>(db, `SELECT e.universe_id AS id, g.name, e.title, e.ends, g.playing, e.starts FROM game_events e JOIN games g ON g.universe_id = e.universe_id
          WHERE e.starts >= ? AND e.starts <= ? ORDER BY e.starts LIMIT 80`, new Date(Date.now() - 2 * DAY).toISOString(), new Date(Date.now() + 14 * DAY).toISOString());
    return { ...base, note: slug === 'events' ? 'Games with a Roblox event running right now, from the events each game has scheduled. Only the busiest games are checked, a hundred at a time.' : 'Events the busiest games have scheduled, from two days ago to two weeks ahead.', valueLabel: slug === 'events' ? 'Players' : 'Starts',
      rows: await gameIcons(rows.map((r) => ({ key: `${r.id}${r.title}`, id: r.id, name: r.name, sub: r.title ?? 'Event', value: slug === 'events' ? r.playing ?? 0 : 0, valueText: slug === 'calendar' ? day(r.starts) : undefined }) as ListRow & { id: number })) };
  }

  if (slug === 'earners') {
    const since = new Date(Date.now() - DAY).toISOString();
    const avg = new Map(q<{ id: number; a: number }>(db, 'SELECT universe_id AS id, AVG(playing) AS a FROM snapshots WHERE ts >= ? GROUP BY universe_id', since).map((r) => [r.id, r.a]));
    const games = q<{ id: number; name: string; cid: number | null; cname: string | null; ctype: string | null; playing: number | null }>(db, 'SELECT universe_id AS id, name, creator_id AS cid, creator_name AS cname, creator_type AS ctype, playing FROM games WHERE playing > 0');
    const studios = new Map<string, { name: string; robux: number; top: { id: number; players: number } }>();
    for (const g of games) {
      if (g.cid == null) continue;
      const players = avg.get(g.id) ?? g.playing ?? 0;
      const robux = players * HOURS_PER_MONTH * ROBUX_PER_PLAYER_HOUR;
      const key = `${g.ctype}:${g.cid}`;
      const s = studios.get(key) ?? { name: g.cname ?? 'Unknown', robux: 0, top: { id: g.id, players: 0 } };
      s.robux += robux;
      if (players > s.top.players) s.top = { id: g.id, players };
      studios.set(key, s);
    }
    const rows = [...studios].sort((a, b) => b[1].robux - a[1].robux).slice(0, 50)
      .map(([key, s]) => ({ key, id: s.top.id, name: s.name, sub: `${Math.round(s.robux / (HOURS_PER_MONTH * ROBUX_PER_PLAYER_HOUR)).toLocaleString('en-US')} players on average`, value: Math.round(s.robux) }) as ListRow & { id: number });
    return { ...base, note: `A rough estimate, not real earnings. Roblox does not publish what games make. Studios are ranked by average players over the last day × ${HOURS_PER_MONTH} hours a month × about ${ROBUX_PER_PLAYER_HOUR} Robux per player-hour (a platform average worked out from Roblox's public yearly bookings and hours), the same for every game. Treat it as a ranking of scale, not a bank balance.`, valueLabel: 'Robux a month (est.)', rows: await gameIcons(rows) };
  }

  return null;
}
