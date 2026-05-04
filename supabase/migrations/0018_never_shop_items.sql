-- Migration 0018 — "never add to shopping list" exclusion list.
--
-- Captures items the household has effectively-infinite supply of and
-- shouldn't appear on /shop regardless of what the AI puts in
-- recipes: water (fridge dispenser / Brita), ice (icemaker), tap-water-
-- adjacent things, herbs from a garden, etc.
--
-- Stored as a text array on the profile (1:1 per user, small list,
-- always read together with the rest of the profile). Names are
-- canonicalised + lowercased at compare time in lib/grocery/derive.ts
-- so casing and singular/plural variants all match.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

alter table profiles
  add column if not exists never_shop_items text[] default '{}'::text[];

-- Sensible defaults for new accounts. Existing profiles keep whatever
-- they had (default '{}' only applies on insert).
update profiles
  set never_shop_items = array['water', 'ice']
  where never_shop_items is null
     or array_length(never_shop_items, 1) is null;

commit;
