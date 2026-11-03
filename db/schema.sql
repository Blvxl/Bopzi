-- Bopzi research database (Postgres / Supabase). Run once in the Supabase SQL editor.
-- All of this is public Roblox information, so anyone may read it; only the collector (service role) may write.

create table if not exists games (
  universe_id   bigint primary key,
  root_place_id bigint,
  name          text not null,
  creator_id    bigint,
  creator_name  text,
  creator_type  text,
  genre_l1      text,
  genre_l2      text,
  created       timestamptz,
  updated       timestamptz,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

-- For a database made before games kept their latest player count:
alter table games add column if not exists playing integer;
alter table games add column if not exists description text;
alter table games add column if not exists max_players integer;
alter table games add column if not exists price integer;
alter table games add column if not exists avatar_type text;
alter table games add column if not exists creator_verified integer;
alter table games add column if not exists visits bigint;
alter table games add column if not exists favorites bigint;
alter table games add column if not exists up_votes bigint;
alter table games add column if not exists down_votes bigint;
alter table games add column if not exists peak bigint;

-- One row per game per collection run. `updated` is the game's last-update time at that moment, so updates can be found by comparing rows.
create table if not exists snapshots (
  universe_id bigint not null references games(universe_id) on delete cascade,
  ts          timestamptz not null,
  playing     integer not null,
  visits      bigint,
  favorites   bigint,
  up_votes    integer,
  down_votes  integer,
  updated     timestamptz,
  primary key (universe_id, ts)
);
create index if not exists snapshots_ts_idx on snapshots (ts desc);

-- Where each game stood on Roblox's own lists (top-playing-now, top-trending, up-and-coming, top-revisited) at each run.
create table if not exists chart_entries (
  ts          timestamptz not null,
  sort_id     text not null,
  rank        integer not null,
  universe_id bigint not null,
  primary key (ts, sort_id, rank)
);
create index if not exists chart_entries_game_idx on chart_entries (universe_id, ts desc);

-- The sum of every tracked game at each run: what the headline chart plots.
create table if not exists totals (
  ts      timestamptz primary key,
  players bigint not null,
  games   integer not null,
  added   bigint  -- players in games found since the previous total, so growth in coverage is not mistaken for growth in players
);
alter table totals add column if not exists added bigint;

-- Words already searched, so the collector keeps asking new questions.
create table if not exists searches (
  query text primary key,
  ts    timestamptz not null,
  found integer not null
);

-- Each time a game's "updated" time moved: when the developer shipped an update, and when Bopzi noticed.
create table if not exists game_updates (
  universe_id bigint not null,
  updated_at  timestamptz not null,
  seen_at     timestamptz not null,
  primary key (universe_id, updated_at)
);

-- Players and number of games per genre at every total.
create table if not exists genre_totals (
  ts      timestamptz not null,
  genre   text not null,
  players bigint not null,
  games   integer not null,
  primary key (ts, genre)
);

-- The groups (studios) behind games, looked up about once a day.
create table if not exists creators (
  creator_id  bigint not null,
  type        text not null,
  name        text,
  description text,
  owner_id    bigint,
  owner_type  text,
  created     timestamptz,
  verified    integer,
  checked     timestamptz not null,
  primary key (creator_id, type)
);

-- The live feed: a game passing a round number (milestone), beating its best (new_high), shipping an update, or arriving new and busy.
create table if not exists events (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null,
  universe_id bigint not null,
  kind        text not null,
  value       bigint,
  prev        bigint,
  detail      text,
  key         text not null,
  unique (universe_id, key)
);
create index if not exists events_ts_idx on events (ts desc);

alter table games         enable row level security;
alter table events        enable row level security;
alter table game_updates  enable row level security;
alter table genre_totals  enable row level security;
alter table creators      enable row level security;
alter table searches      enable row level security;
alter table totals        enable row level security;
alter table snapshots     enable row level security;
alter table chart_entries enable row level security;

drop policy if exists "public read" on games;
drop policy if exists "public read" on snapshots;
drop policy if exists "public read" on chart_entries;
drop policy if exists "public read" on totals;
drop policy if exists "public read" on events;
drop policy if exists "public read" on game_updates;
drop policy if exists "public read" on genre_totals;
drop policy if exists "public read" on creators;
create policy "public read" on games         for select using (true);
create policy "public read" on snapshots     for select using (true);
create policy "public read" on chart_entries for select using (true);
create policy "public read" on totals        for select using (true);
create policy "public read" on events        for select using (true);
create policy "public read" on game_updates  for select using (true);
create policy "public read" on genre_totals  for select using (true);
create policy "public read" on creators      for select using (true);
