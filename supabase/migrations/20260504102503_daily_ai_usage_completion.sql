-- Corrective migration applied via MCP to recover from a partial apply
-- of 0019_daily_ai_usage.sql. CREATE POLICY has no IF NOT EXISTS clause,
-- so when 0019 was retried after a network blip mid-apply, the second
-- run errored on "policy already exists" and never reached the function
-- + grant statements.
--
-- This file mirrors what was applied via MCP to production. It is
-- idempotent — safe to re-run on any schema state — and exists in
-- the local migrations directory so Supabase's preview-branch check
-- finds a 1:1 match between local files and the remote migrations
-- table. New self-hosters running migrations from scratch don't need
-- this (the patched 0019 is now idempotent on its own — see PR #36),
-- but it's harmless to apply.

alter table daily_ai_usage enable row level security;

drop policy if exists "users_read_own_usage" on daily_ai_usage;
create policy "users_read_own_usage" on daily_ai_usage
  for select
  using (auth.uid() = user_id);

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

grant execute on function increment_daily_ai_usage(uuid) to authenticated;
