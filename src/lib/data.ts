import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** What each table holds, in plain words, for the research bot. Keep in step with docs/data.md. */
export const DICTIONARY: Record<string, string> = {
  games: 'One row per Roblox experience Bopzi has found: name, creator, genre, created/updated dates, description, max players, price, and the latest players, visits, favorites and votes. `playing` is the most recent player count; `last_seen` only moves forward while someone is playing.',
  snapshots: 'Player counts over time for one game. Games with 500+ players are saved about every 5 minutes, smaller ones about once an hour. Also visits, favorites and votes at that moment.',
  totals: 'The headline series: total players in every tracked game at each collection (about every 3 minutes). `added` is how many of those players were in games found since the previous total, so growth in coverage can be told apart from growth in players: the like-for-like step is players minus added.',
  genre_totals: 'Players and number of active games per genre (genre_l1) at every total. Games whose genre is not known yet are under Unknown.',
  game_updates: "Each time a game's `updated` time moved, meaning the developer shipped an update. `updated_at` is when Roblox says it happened, `seen_at` when Bopzi noticed.",
  chart_entries: "Where games stood on Roblox's own lists (top-playing-now, top-trending, up-and-coming, top-revisited) at each snapshot run. `rank` 1 is best.",
  creators: "The groups (studios) that own games: name, description, owner, creation date, verified badge. Join on games.creator_id where games.creator_type = 'Group'.",
  game_tags: "What each busy game is, read from its name and description by matching words: kind is type, theme, feature, brand, extra (paid extras it mentions) or language. A game can have several. Crude compared with an AI reading; treat it as a guide.",
  game_looks: "The colour mood of each busy game's icon (Dark & moody, Light & soft, Vivid, Warm, Cool, Green, Muted), measured from its pixels. Colour only, not art style.",
  search_terms: "What Roblox suggests as players start typing, read every few hours: rank 1 is the best suggestion, trending 1 means Roblox flags it as trending, players is the players in the games that search finds. Order, not search volume.",
  game_events: "Events a game has scheduled on Roblox (updates, parties): title, description, starts and ends. Only the busiest games are checked, a hundred at a time.",
  creator_changes: "Each time a game's owner (user or group) changed, with the old and new owner.",
  searches: 'Words Bopzi has searched Roblox for to find games, and how many new games each found. Internal bookkeeping.',
};

export const dbPath = () => process.env.BOPZI_DB ?? path.join(process.cwd(), 'data', 'bopzi.sqlite');

/** The data API is for Bopzi's own research bot, not for the public: it needs the token from BOPZI_DATA_TOKEN. */
export function authorized(req: Request) {
  const want = process.env.BOPZI_DATA_TOKEN;
  if (!want) return { ok: false as const, status: 503, error: 'The data API is not switched on: set BOPZI_DATA_TOKEN.' };
  const got = (req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.headers.get('x-bopzi-token') ?? '').trim();
  const a = Buffer.from(got), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false as const, status: 401, error: 'Missing or wrong token.' };
  return { ok: true as const };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Opens the database read-only; nothing done through it can change the data. */
export function openReadOnly() {
  const file = dbPath();
  if (!existsSync(file)) return null;
  return new DatabaseSync(file, { readOnly: true });
}

const MAX_ROWS = 500;
const BLOCKED = /\b(attach|detach|pragma|load_extension|vacuum|insert|update|delete|drop|alter|create|replace)\b/i;

/** One read-only SELECT, at most 500 rows back. */
export function runSelect(db: DatabaseSync, sql: string) {
  const text = sql.trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(text)) throw new Error('Only a single SELECT (or WITH … SELECT) is allowed.');
  if (text.includes(';')) throw new Error('One statement at a time.');
  if (BLOCKED.test(text)) throw new Error('That statement uses a word that is not allowed (attach, pragma, insert, update, delete, drop, alter, create, replace).');
  const rows = db.prepare(`SELECT * FROM (${text}) LIMIT ${MAX_ROWS + 1}`).all() as Record<string, unknown>[];
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}
