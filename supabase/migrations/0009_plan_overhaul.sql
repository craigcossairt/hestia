-- Migration 0009 — Plan overhaul foundations
--
-- Adds the data model bits the new plan generator needs:
--   1. recipes.servings — how many adult servings the recipe yields. Lets
--      the planner decide whether one cook session covers multiple slots
--      (e.g. Monday dinner → Tuesday lunch leftover).
--   2. recipes.source_image_url — when a recipe is parsed from a webpage,
--      the og:image URL extracted at parse time. Used as the preferred
--      photo source.
--   3. meal_plan_entries.is_leftover_of — points to the original plan
--      entry whose cook session this slot reuses. UI labels it
--      "Leftover from Tue dinner".
--   4. meal_plan_entries.servings_used — how many servings of the source
--      recipe this slot consumes. Defaults to 1.
--
-- Idempotent: safe to re-run.

alter table recipes
  add column if not exists servings int default 4 check (servings > 0),
  add column if not exists source_image_url text;

alter table meal_plan_entries
  add column if not exists is_leftover_of uuid
    references meal_plan_entries(id) on delete set null,
  add column if not exists servings_used numeric default 1
    check (servings_used > 0);

create index if not exists meal_plan_entries_leftover_idx
  on meal_plan_entries(is_leftover_of)
  where is_leftover_of is not null;
