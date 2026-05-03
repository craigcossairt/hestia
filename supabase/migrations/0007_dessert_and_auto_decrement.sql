-- Migration 0007 — add 'dessert' slot + auto-decrement pantry setting
--
-- Adds:
--   1. 'dessert' to the meal_plan_entries.slot and meal_logs.slot check
--      constraints (between dinner and snack in the UX ordering).
--   2. profiles.auto_decrement_pantry boolean — when true, marking a recipe
--      cooked subtracts the matched ingredients from pantry_items.
--
-- Idempotent: safe to re-run.

-- Drop old constraints (their auto-generated names follow Postgres convention).
alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_slot_check;
alter table meal_plan_entries
  add constraint meal_plan_entries_slot_check
  check (slot in ('breakfast', 'lunch', 'dinner', 'dessert', 'snack'));

alter table meal_logs
  drop constraint if exists meal_logs_slot_check;
alter table meal_logs
  add constraint meal_logs_slot_check
  check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'dessert', 'snack'));

alter table profiles
  add column if not exists auto_decrement_pantry boolean default false;
