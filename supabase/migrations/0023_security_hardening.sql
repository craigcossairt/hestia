-- Migration 0023 — security hardening from full codebase review
--
-- 1. Hide Kroger OAuth token columns from PostgREST (anon/authenticated).
--    Server code reads/writes them via the service-role client only.
-- 2. Stop authenticated clients from writing the shared kroger_price_cache.
-- 3. Atomic meal-plan move/swap RPC (avoids unique(user_id, date, slot) races).

-- ---------------------------------------------------------------------------
-- 1. Kroger token columns: revoke from client roles
-- ---------------------------------------------------------------------------
-- Service role bypasses grants via the dashboard key; authenticated JWTs
-- must not be able to SELECT or UPDATE raw access/refresh tokens.

revoke select (kroger_access_token, kroger_refresh_token) on table profiles from authenticated, anon;
revoke update (kroger_access_token, kroger_refresh_token) on table profiles from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. kroger_price_cache: read-only for authenticated; writes via service role
-- ---------------------------------------------------------------------------
drop policy if exists "kroger_price_cache_write" on kroger_price_cache;
drop policy if exists "kroger_price_cache_insert" on kroger_price_cache;
drop policy if exists "kroger_price_cache_update" on kroger_price_cache;
drop policy if exists "kroger_price_cache_delete" on kroger_price_cache;

-- Keep authenticated SELECT (shared catalog cache). No write policies =
-- authenticated cannot insert/update/delete; service_role still can.

-- ---------------------------------------------------------------------------
-- 3. Atomic plan entry move / swap
-- ---------------------------------------------------------------------------
create or replace function swap_or_move_meal_plan_entry(
  p_from_id uuid,
  p_to_date date,
  p_to_slot text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from meal_plan_entries%rowtype;
  v_to_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_to_slot is null or p_to_slot not in (
    'breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'beverage'
  ) then
    raise exception 'invalid slot';
  end if;

  select * into v_from
  from meal_plan_entries
  where id = p_from_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'source not found';
  end if;

  if v_from.date = p_to_date and v_from.slot = p_to_slot then
    return;
  end if;

  select id into v_to_id
  from meal_plan_entries
  where user_id = v_uid and date = p_to_date and slot = p_to_slot
  for update;

  if v_to_id is not null then
    -- Three-phase park on a sentinel date outside normal planning range.
    update meal_plan_entries
      set date = date '1900-01-01', slot = v_from.slot
      where id = p_from_id;

    update meal_plan_entries
      set date = v_from.date, slot = v_from.slot
      where id = v_to_id;

    update meal_plan_entries
      set date = p_to_date, slot = p_to_slot
      where id = p_from_id;
  else
    update meal_plan_entries
      set date = p_to_date, slot = p_to_slot
      where id = p_from_id;
  end if;
end;
$$;

revoke all on function swap_or_move_meal_plan_entry(uuid, date, text) from public;
grant execute on function swap_or_move_meal_plan_entry(uuid, date, text) to authenticated;
