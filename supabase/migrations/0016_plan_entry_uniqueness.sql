-- Migration 0016 — meal_plan_entries: dedupe + structural uniqueness.
--
-- Background: two saves of the same week could race because /api/ai/
-- plan-week/save reads `existingPlans` once at the top of the request,
-- then loops inserting. If a second concurrent request reads existing
-- BEFORE the first one writes, both decide the slot is empty and both
-- insert — and the table had no constraint stopping them. One user
-- accumulated 10,158 rows for a single 7-day window.
--
-- This migration:
--   1. Collapses dupes: keeps the OLDEST row per (user_id, date, slot),
--      deletes the rest. Ties broken by id.
--   2. Adds a UNIQUE constraint on (user_id, date, slot) so future
--      races are impossible at the DB level. The server then uses
--      upsert(onConflict) and the constraint quietly absorbs racers.
--   3. Cleans up auto-generated recipes that the duplicate runs
--      created and that nothing references — same idempotent pattern
--      as 0012 (which only ran once and didn't account for THIS race).
--
-- Idempotent: re-running this is a no-op once the table is clean.

begin;

-- ────────────────────────────────────────────────────────────────────
-- 1. Collapse meal_plan_entries duplicates per (user_id, date, slot).
-- ────────────────────────────────────────────────────────────────────
with ranked as (
  select id,
         row_number() over (
           partition by user_id, date, slot
           order by created_at, id
         ) as rn
  from meal_plan_entries
)
delete from meal_plan_entries
where id in (select id from ranked where rn > 1);

-- ────────────────────────────────────────────────────────────────────
-- 2. Add the unique constraint. From here on, the application can use
--    upsert with onConflict and races become inert.
-- ────────────────────────────────────────────────────────────────────
alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_one_per_slot;
alter table meal_plan_entries
  add constraint meal_plan_entries_one_per_slot
  unique (user_id, date, slot);

-- ────────────────────────────────────────────────────────────────────
-- 3. Garbage-collect auto-generated recipes that no plan_entry,
--    saved_recipe, or recipe_rating points at. The race created up
--    to thousands of these.
-- ────────────────────────────────────────────────────────────────────
delete from recipes r
where 'auto-generated' = ANY(r.tags)
  and not exists (select 1 from meal_plan_entries mpe where mpe.recipe_id = r.id)
  and not exists (select 1 from saved_recipes sr where sr.recipe_id = r.id)
  and not exists (select 1 from recipe_ratings rr where rr.recipe_id = r.id);

commit;
