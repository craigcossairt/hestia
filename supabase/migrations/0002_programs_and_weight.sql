-- Migration 0002 — Programs + Weight tracking
--
-- Adds:
--   1. profiles.active_program (text, nullable) — slug of the user's currently
--      active program (see lib/programs/index.ts). Coach + insight prompts
--      include the program's guidance when set.
--   2. weight_logs table — time-series of weight measurements for the long-
--      term Stats chart. Stored canonical metric; UI converts to lb.
--
-- Idempotent: safe to re-run.

alter table profiles
  add column if not exists active_program text;

create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  value_kg numeric not null check (value_kg > 20 and value_kg < 300),
  logged_at timestamptz not null default now(),
  note text
);

create index if not exists weight_logs_user_idx
  on weight_logs(user_id, logged_at desc);

alter table weight_logs enable row level security;

drop policy if exists "own weight" on weight_logs;
create policy "own weight"
  on weight_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
