-- Migration 0010 — per-member modifications on recipes
--
-- When a recipe is generated for a household with named family members,
-- the AI can include short adaptation notes per person (e.g. Sam = +1.5x
-- portion + sweet potato; Avery = sub onions for zucchini). Stored as a
-- jsonb array on the recipe itself so the recipe page can surface it
-- without recomputing.
--
-- Idempotent: safe to re-run.

alter table recipes
  add column if not exists family_notes_json jsonb default '[]'::jsonb;
