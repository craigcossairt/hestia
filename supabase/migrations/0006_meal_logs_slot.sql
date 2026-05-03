-- Migration 0006 — meal_logs.slot + family_member_id
--
-- Quick-logged meals previously left the slot ambiguous, so a "Log a meal"
-- click on a Today breakfast slot would create the meal_log but the
-- breakfast card still showed "Nothing planned" because the Today page only
-- inferred the slot from a planned recipe.
--
-- Adds:
--   1. meal_logs.slot text — null = freeform log (no specific slot intent),
--      set = the slot the user attached the log to.
--   2. meal_logs.family_member_id text — for per-member views on Today / Stats.
--      null = the account holder.
--
-- Idempotent: safe to re-run.

alter table meal_logs
  add column if not exists slot text
    check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  add column if not exists family_member_id text;

create index if not exists meal_logs_user_member_logged_idx
  on meal_logs(user_id, family_member_id, logged_at desc);
