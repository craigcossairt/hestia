-- Migration 0012 — clean up auto-generated recipe duplicates
--
-- Background: before this migration the plan-week generator inserted a
-- new recipes row on every regeneration, even when the AI produced the
-- same recipe name + macros. After ~50 regenerations a typical user's
-- recipes table balloons by tens of thousands of rows.
--
-- This migration is a one-time cleanup. It:
--   1. Collapses duplicate auto-generated recipes per user, keeping the
--      OLDEST row of each (owner_id, name, kcal, protein) group.
--   2. Repoints any meal_plan_entries.recipe_id on duplicates to the
--      kept (canonical) row, so existing plans don't break.
--   3. Repoints saved_recipes + recipe_ratings the same way (only when
--      no row already exists for the canonical recipe — the unique
--      constraint blocks otherwise).
--   4. Deletes the now-orphaned duplicate rows.
--   5. Deletes any auto-generated recipes that have NO references at
--      all (orphans from older regenerations).
--
-- Idempotent: running it again does nothing once the table is clean.
-- Manual recipes (no 'auto-generated' tag) are never touched.

begin;

-- ────────────────────────────────────────────────────────────────────
-- 1 + 2: Collapse duplicates and rewire meal_plan_entries.
-- ────────────────────────────────────────────────────────────────────

-- For each user, group auto-generated recipes by (name, kcal, protein).
-- Keep the oldest row in each group as the canonical "keeper".
with ranked as (
  select
    id,
    owner_id,
    name,
    kcal,
    protein,
    created_at,
    row_number() over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as keeper_id
  from recipes
  where 'auto-generated' = any(coalesce(tags, '{}'::text[]))
    and owner_id is not null
),
duplicates as (
  select id, keeper_id from ranked where rn > 1
)
update meal_plan_entries
   set recipe_id = duplicates.keeper_id
  from duplicates
 where meal_plan_entries.recipe_id = duplicates.id;

-- ────────────────────────────────────────────────────────────────────
-- 3: Rewire saved_recipes + recipe_ratings (when safe).
-- ────────────────────────────────────────────────────────────────────

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as keeper_id
  from recipes
  where 'auto-generated' = any(coalesce(tags, '{}'::text[]))
    and owner_id is not null
),
duplicates as (
  select id, keeper_id from ranked where rn > 1
)
update saved_recipes
   set recipe_id = duplicates.keeper_id
  from duplicates
 where saved_recipes.recipe_id = duplicates.id
   -- Skip when the user already saved the keeper (unique constraint).
   and not exists (
     select 1 from saved_recipes sr2
     where sr2.user_id = saved_recipes.user_id
       and sr2.recipe_id = duplicates.keeper_id
   );

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as rn,
    first_value(id) over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as keeper_id
  from recipes
  where 'auto-generated' = any(coalesce(tags, '{}'::text[]))
    and owner_id is not null
),
duplicates as (
  select id, keeper_id from ranked where rn > 1
)
update recipe_ratings
   set recipe_id = duplicates.keeper_id
  from duplicates
 where recipe_ratings.recipe_id = duplicates.id
   and not exists (
     select 1 from recipe_ratings rr2
     where rr2.user_id = recipe_ratings.user_id
       and rr2.recipe_id = duplicates.keeper_id
   );

-- ────────────────────────────────────────────────────────────────────
-- 4: Delete the now-unreferenced duplicate rows.
-- ────────────────────────────────────────────────────────────────────

with ranked as (
  select
    id,
    owner_id,
    row_number() over (
      partition by owner_id, name, kcal, protein
      order by created_at asc, id asc
    ) as rn
  from recipes
  where 'auto-generated' = any(coalesce(tags, '{}'::text[]))
    and owner_id is not null
)
delete from recipes
 where id in (select id from ranked where rn > 1);

-- ────────────────────────────────────────────────────────────────────
-- 5: Drop fully orphaned auto-generated recipes (no plan entry, no
--    save, no rating). Older regenerations that left orphans behind.
-- ────────────────────────────────────────────────────────────────────

delete from recipes r
 where 'auto-generated' = any(coalesce(r.tags, '{}'::text[]))
   and r.owner_id is not null
   and not exists (
     select 1 from meal_plan_entries mpe where mpe.recipe_id = r.id
   )
   and not exists (
     select 1 from saved_recipes sr where sr.recipe_id = r.id
   )
   and not exists (
     select 1 from recipe_ratings rr where rr.recipe_id = r.id
   );

commit;
