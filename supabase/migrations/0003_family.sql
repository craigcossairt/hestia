-- Migration 0003 — Family members
--
-- Adds profiles.family_json (jsonb array) for storing the user's household
-- members. Each entry: { id, name, age, sex?, dietary_restrictions[], notes?,
-- portion_modifier? }. Kept as JSON instead of a separate table because
-- there's no inter-user sharing in v1 — household lives entirely under one
-- account.
--
-- Idempotent: safe to re-run.

alter table profiles
  add column if not exists family_json jsonb default '[]'::jsonb;
