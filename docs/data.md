# Bopzi data (for the research bot)

Everything Bopzi collects from Roblox lives in one database, `data/bopzi.sqlite` (SQLite; Supabase later with the same tables, see `db/schema.sql`). None of it needs to appear on the website. A private, read-only API lets the research bot ("Bopsy") query it.

## Private data API

Switched on by `BOPZI_DATA_TOKEN` in `.env.local` (generated locally, never committed). Send it as `Authorization: Bearer <token>`. Without the token every call is refused.

| Call | What it gives |
|---|---|
| `GET /api/data/schema` | Every table, its columns, row counts, what it is for, and the time span of the history. **Read this first.** |
| `GET /api/data/sql?q=SELECT …` or `POST /api/data/sql` with `{"sql": "…"}` | Runs one read-only `SELECT` (or `WITH … SELECT`). At most 500 rows come back. SQLite dialect. |
| `GET /api/data/game/<universe id>` | One game: its row, the studio behind it, its last 600 player counts, its updates and its list ranks. |

Times are UTC ISO strings (`2026-11-03T07:15:17.716Z`). Ids are Roblox universe ids.

## Tables

| Table | One row per | Main columns |
|---|---|---|
| `games` | game | `universe_id`, `name`, `creator_id/name/type/verified`, `genre_l1/l2`, `created`, `updated`, `description`, `max_players`, `price`, `playing`, `visits`, `favorites`, `up_votes`, `down_votes`, `first_seen`, `last_seen` |
| `snapshots` | game per collection | `universe_id`, `ts`, `playing`, `visits`, `favorites`, `up_votes`, `down_votes`, `updated`. Games with 500+ players about every 5 min; smaller ones about hourly. |
| `totals` | collection (~every 3 min) | `ts`, `players` (all tracked games), `games` (with players), `added` (players in games found since the previous total) |
| `genre_totals` | genre per collection | `ts`, `genre`, `players`, `games` |
| `game_updates` | update shipped | `universe_id`, `updated_at`, `seen_at` |
| `chart_entries` | game per Roblox list per snapshot run | `ts`, `sort_id` (`top-playing-now`, `top-trending`, `up-and-coming`, `top-revisited`), `rank`, `universe_id` |
| `creators` | group (studio) | `creator_id`, `name`, `description`, `owner_id`, `created`, `verified` |
| `searches` | search word | internal bookkeeping |

## Things the bot must know

- **Coverage is partial.** `totals.players` adds up the games Bopzi has found, not every game on Roblox. Compared with RoTerminal's "All of Roblox" it has been about 80–85%, and rises as more games are found. Say so when quoting it.
- **Growth in coverage is not growth in players.** When comparing totals over time, use the like-for-like step: `players - added` against the previous `players`. Totals saved before the `added` column existed have `added` NULL and are not comparable.
- **Gaps are real.** If the collector was off there are no rows for that time. Never fill a gap with guesses.
- **Small games are refreshed less often.** Games under 500 players are looked up every few ticks and counted at their last known value in between.
- **Genre can be missing.** `genre_l1` is only known for games Roblox's details lookup has returned; others appear as Unknown in `genre_totals`.
- **History starts when collection started** (2 Nov 2026). Roblox publishes no history, so nothing earlier can be reconstructed.

## Example questions the bot can answer with SQL

```sql
-- Which genres grew the most players over the last day?
WITH last AS (SELECT MAX(ts) t FROM genre_totals)
SELECT g.genre, g.players AS now, o.players AS day_ago, ROUND(100.0 * (g.players - o.players) / o.players, 1) AS pct
FROM genre_totals g, last
JOIN genre_totals o ON o.genre = g.genre AND o.ts = (SELECT MIN(ts) FROM genre_totals WHERE ts >= datetime(last.t, '-1 day'))
WHERE g.ts = last.t AND o.players > 1000 ORDER BY pct DESC LIMIT 10;

-- Games that shipped an update in the last 24 hours and how their players moved afterwards
SELECT g.name, u.updated_at,
  (SELECT playing FROM snapshots s WHERE s.universe_id = u.universe_id AND s.ts <= u.updated_at ORDER BY s.ts DESC LIMIT 1) AS before,
  (SELECT playing FROM snapshots s WHERE s.universe_id = u.universe_id ORDER BY s.ts DESC LIMIT 1) AS now
FROM game_updates u JOIN games g USING (universe_id) WHERE u.updated_at >= datetime('now', '-1 day') ORDER BY u.updated_at DESC LIMIT 20;

-- New games (created this week) that already have players
SELECT name, creator_name, created, playing FROM games WHERE created >= datetime('now', '-7 day') AND playing >= 100 ORDER BY playing DESC LIMIT 20;

-- Studios with the most players across their games
SELECT c.name, COUNT(*) AS games, SUM(g.playing) AS players FROM games g JOIN creators c ON c.creator_id = g.creator_id AND c.type = 'Group'
WHERE g.playing > 0 GROUP BY c.creator_id ORDER BY players DESC LIMIT 15;
```

## How it is collected

`npm run collect:local` keeps two loops running (see `collector/`):
- **tick** (about every 3 minutes): Roblox's four public lists, then a lookup of the busiest known games (quieter ones in turns), then the total, genre totals, update detection, per-game snapshots.
- **discover** (every few minutes): searches Roblox for games not yet known, by fixed words, studio names and unusual words from game names; also looks up studios once a day.

Roblox only allows about 17 detail lookups in a burst, which is why not every game is refreshed every tick.

## Lists and extra tables (added later)

The site's Lists pages (`/lists`) are built from the same data, plus these tables, filled by `collector/enrich.mjs` (scheduled by `npm run collect:local`):

| Table | What it holds | How it is made |
|---|---|---|
| `game_tags` | `kind` (type, theme, feature, brand, extra, language) and `tag` per game | Word matching on each busy game's name and description (`collector/tagger.mjs`). Crude: a game can have several tags and some are missed. |
| `tag_state` | A hash of the text last read | So a game is only read again when its name or description changes. |
| `game_looks` | The colour mood of a game's icon | Pixels of the icon, reduced to 16×16: Dark & moody, Light & soft, Vivid, Warm, Cool, Green, Muted. Colour only, not art style. |
| `search_terms` | Roblox's top three search suggestions for each first letter, with players | Roblox's own suggestion box, every 3 hours. `players` is the players in games whose name matches the search. Roblox publishes no search counts. |
| `game_events` | Events a game scheduled on Roblox (title, starts, ends) | Roblox's public events call, 100 busy games at a time. |
| `creator_changes` | A game's owner changing (old and new owner) | Compared at every lookup, games with 100+ players. Also appears in the live feed as "changed hands". |

Notes for the bot:
- **Earnings are a rough estimate, not data.** The "Top earners" list multiplies average players over the last day by 730 hours a month by about 5 Robux per player-hour, the same for every game. Roblox does not publish what games make.
- **Ads are not covered.** Roblox only shows sponsored results to signed-in accounts, and Bopzi does not automate an account.
- **Growth on the lists compares with about a day ago, or the start of the history if that is shorter**, using only games present at both times, so finding more games does not look like growth.
