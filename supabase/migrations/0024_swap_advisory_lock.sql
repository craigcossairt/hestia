-- Migration 0024 — serialize meal-plan swaps per user (advisory lock)
--
-- CodeRabbit: reciprocal concurrent swaps can lock source/target rows in
-- opposite order and deadlock. Take a transaction-scoped advisory lock
-- keyed by auth.uid() before touching either row.

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

  -- Serialize all move/swap work for this user for the duration of the
  -- transaction so two reciprocal swaps cannot deadlock on row locks.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

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
