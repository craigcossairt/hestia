-- Migration 0005 — Full member parity + diet/health expansion
--
-- Adds:
--   1. profiles.allergies text[] — hard food restrictions (peanut, shellfish,
--      etc.). Coach + recipe gen treat these as never-violate constraints.
--   2. profiles.disliked_foods text[] — soft preferences. AI avoids when
--      possible, OK to break for variety.
--   3. profiles.medical_conditions text[] — chronic conditions (diabetes,
--      celiac, hypertension). Inform AI suggestions; never replace clinician.
--   4. weight_logs.family_member_id text — null = account holder, set = the
--      family member's id within profiles.family_json. Lets us track weight
--      per household member without splintering the table.
--
-- Family member parity fields (height/weight/activity/goal/targets/schedule/
-- allergies/dislikes/medical_conditions) live inside profiles.family_json —
-- jsonb already supports arbitrary additions, no schema change needed.
--
-- Idempotent: safe to re-run.

alter table profiles
  add column if not exists allergies text[] default '{}'::text[],
  add column if not exists disliked_foods text[] default '{}'::text[],
  add column if not exists medical_conditions text[] default '{}'::text[];

alter table weight_logs
  add column if not exists family_member_id text;

create index if not exists weight_logs_user_member_idx
  on weight_logs(user_id, family_member_id, logged_at desc);
