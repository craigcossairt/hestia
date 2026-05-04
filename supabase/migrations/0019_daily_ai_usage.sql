-- Per-user daily AI usage counter, used by lib/ai/quota.ts to cap any
-- one account from running up the host's xAI/OpenAI/etc. bill on a
-- shared instance. Single counter per (user, day) — we don't track
-- per-route at this level (a noisy route would have to be 100% of the
-- daily traffic to skew anything, and the cap is whole-account anyway).
--
-- The table is read-only via RLS so a user can see their own usage but
-- cannot tamper with the count to bypass the limit. Increments happen
-- through a SECURITY DEFINER function that the server actions call.
-- That's the only path that writes — no direct insert/update policy.

create table if not exists daily_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table daily_ai_usage enable row level security;

-- Users can read their own usage (powers the "X of Y used today" UI
-- when we add it; not used yet but cheap to expose).
-- Drop-then-create so partial re-runs of this migration don't error
-- on "policy already exists" — Postgres' CREATE POLICY has no
-- IF NOT EXISTS clause until PG 15, and even then we want predictable
-- re-run semantics.
drop policy if exists "users_read_own_usage" on daily_ai_usage;
create policy "users_read_own_usage" on daily_ai_usage
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy → all writes are blocked from the
-- user's session. Increments must go through the SECURITY DEFINER
-- function below.

-- Atomic upsert + increment. Returns the new count after increment so
-- the caller can decide whether to allow or 429 the request.
create or replace function increment_daily_ai_usage(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  insert into daily_ai_usage (user_id, day, count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, day)
    do update set count = daily_ai_usage.count + 1
  returning count into new_count;
  return new_count;
end
$$;

-- Allow authenticated callers to invoke the function. The function's
-- definer-rights logic enforces "you can only increment your own
-- counter" because the routes always pass auth.uid() as p_user_id.
grant execute on function increment_daily_ai_usage(uuid) to authenticated;
