-- Migration 0004 — Multi-active programs with category guards
--
-- Replaces the single profiles.active_program text column with an array,
-- so users can have multiple programs active at once. The application
-- enforces conflict guards by program "kind" (workflow stacks; pattern
-- and focus are exclusive within a scope).
--
-- Per-family-member program assignments live inside profiles.family_json
-- (existing jsonb array) — no schema change needed there. Each member
-- entry now optionally carries an active_programs string array.
--
-- Idempotent: safe to re-run.

alter table profiles
  add column if not exists active_programs text[] default '{}'::text[];

-- Backfill from the legacy single column.
update profiles
  set active_programs = array[active_program]
  where active_program is not null
    and (
      active_programs is null
      or array_length(active_programs, 1) is null
    );

-- profiles.active_program is intentionally kept as a one-release safety
-- net. A future migration will drop it once we've verified the new
-- column is read everywhere.
