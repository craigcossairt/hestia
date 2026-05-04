-- Migration 0011 — recipe tips
--
-- Recipes now carry an optional list of cooking tips: short
-- expert-level pointers like "let the meat rest 5 min before slicing"
-- or "use full-fat coconut milk for creaminess". Distinct from steps
-- (mandatory actions); tips are advisory.
--
-- The AI's image_url passthrough doesn't need a column — it flows
-- straight into the existing recipes.photo_url through the photo
-- resolver.
--
-- Idempotent: safe to re-run.

alter table recipes
  add column if not exists tips_json jsonb default '[]'::jsonb;
