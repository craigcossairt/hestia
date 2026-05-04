-- Migration 0017 — store the Kroger banner chain on the profile so we
-- can deep-link to the correct banner site (smithsfoodanddrug.com,
-- frysfood.com, etc.) instead of always sending users to kroger.com.
--
-- The chain code comes from Kroger's /locations response (e.g.
-- "SMITHS", "KROGER", "FRYS"). We didn't persist it on the original
-- store-picker save, so existing users have null here — the SendToCart
-- "open cart" link falls back to kroger.com when this is null, same as
-- it did before.
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

alter table profiles
  add column if not exists preferred_kroger_chain text;

-- Best-effort backfill from the saved location name. Anyone who picked
-- a store before this column existed gets the right banner site auto-
-- inferred so they don't have to re-pick. Pattern-matched against
-- common Kroger banner brand names; anything we don't recognise stays
-- null and falls back to kroger.com in the UI.
update profiles set preferred_kroger_chain = 'SMITHS'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%smith%';
update profiles set preferred_kroger_chain = 'FRYS'
  where preferred_kroger_chain is null
    and (preferred_kroger_location_name ilike '%fry''s%'
         or preferred_kroger_location_name ilike '%frys%');
update profiles set preferred_kroger_chain = 'KING SOOPERS'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%king sooper%';
update profiles set preferred_kroger_chain = 'CITY MARKET'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%city market%';
update profiles set preferred_kroger_chain = 'DILLONS'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%dillon%';
update profiles set preferred_kroger_chain = 'FRED MEYER'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%fred meyer%';
update profiles set preferred_kroger_chain = 'HARRIS TEETER'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%harris teeter%';
update profiles set preferred_kroger_chain = 'QFC'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%qfc%';
update profiles set preferred_kroger_chain = 'RALPHS'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%ralphs%';
update profiles set preferred_kroger_chain = 'MARIANOS'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%mariano%';
update profiles set preferred_kroger_chain = 'PICK N SAVE'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%pick %save%';
update profiles set preferred_kroger_chain = 'KROGER'
  where preferred_kroger_chain is null
    and preferred_kroger_location_name ilike '%kroger%';

commit;
