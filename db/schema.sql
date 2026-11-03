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
  games   integer not null
);

-- Words already searched, so the collector keeps asking new questions.
create table if not exists searches (
  query text primary key,
  ts    timestamptz not null,
  found integer not null
);

alter table games         enable row level security;
alter table searches      enable row level security;
alter table totals        enable row level security;
alter table snapshots     enable row level security;
alter table chart_entries enable row level security;

drop policy if exists "public read" on games;
drop policy if exists "public read" on snapshots;
drop policy if exists "public read" on chart_entries;
drop policy if exists "public read" on totals;
create policy "public read" on games         for select using (true);
create policy "public read" on snapshots     for select using (true);
create policy "public read" on chart_entries for select using (true);
create policy "public read" on totals        for select using (true);
