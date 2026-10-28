-- All-time scores for every Game of Squids mini-game.
-- Run this ONCE in the Supabase project (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to run again: it only creates things that don't exist yet and re-applies the permissions.
--
-- One row per player per finished game. Each game posts its own rows (game = its id, e.g. "red-light",
-- mode = its own mode name, e.g. "normal"). Leaderboards read the score_totals view below.

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  game       text        not null check (char_length(game) between 1 and 40),
  mode       text        not null default '' check (char_length(mode) <= 40),
  player     text        not null check (char_length(player) between 1 and 24),
  won        boolean     not null default false,      -- made it / finished / survived (the game decides)
  time_ms    integer     check (time_ms is null or time_ms between 1 and 3600000),  -- e.g. time to cross
  kills      smallint    not null default 0 check (kills between 0 and 100),
  extra      jsonb       not null default '{}'::jsonb check (pg_column_size(extra) < 2000),  -- anything else
  created_at timestamptz not null default now()
);
create index if not exists scores_game_mode on public.scores (game, mode);

-- Row Level Security: anyone with the game's public (publishable) key can read scores and add new ones,
-- but nobody can change or delete them from the game (no update / delete policies).
alter table public.scores enable row level security;
drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores for select to anon, authenticated using (true);
drop policy if exists "players add their own scores" on public.scores;
create policy "players add their own scores" on public.scores for insert to anon, authenticated with check (true);

-- Permissions (players aren't signed in, so the game uses the "anon" role: it may read and add, not change).
grant select, insert on public.scores to anon;
grant select, insert, update, delete on public.scores to authenticated, service_role;

-- Totals per player: for each game, per mode AND for all modes together (mode = '*').
create or replace view public.score_totals with (security_invoker = true) as
select game,
       coalesce(mode, '*') as mode,
       player,
       count(*)::int                                                   as games,
       (count(*) filter (where won))::int                              as wins,
       coalesce(sum(kills), 0)::int                                    as kills,
       min(time_ms) filter (where won and time_ms is not null)         as best_ms
from public.scores
group by grouping sets ((game, mode, player), (game, player));

grant select on public.score_totals to anon, authenticated, service_role;
