-- Migration 0013 — Kroger integration (Phase 1)
--
-- Adds the user's preferred Kroger / Smith's store (so /shop can fetch
-- real prices + aisles for that specific store) and a price cache so we
-- don't burn the daily product-search quota on every /shop page load.
--
-- Run this in the Supabase SQL editor before the next deploy. Idempotent:
-- safe to re-run.

begin;

-- ────────────────────────────────────────────────────────────────────
-- 1. profiles: store the user's chosen Kroger location.
-- ────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists preferred_kroger_location_id text,
  add column if not exists preferred_kroger_location_name text,
  add column if not exists preferred_kroger_zip text;

-- ────────────────────────────────────────────────────────────────────
-- 2. kroger_price_cache: per-(location, query) cache.
--
-- Kroger's product search is rate-limited (~5k calls/day, production)
-- and prices change daily but not by the minute, so we cache results
-- with a 24-hour TTL — checked at read time by comparing fetched_at.
--
-- The cache is global (not per-user) because prices are per-store, not
-- per-user. Two users shopping the same Smith's get the same numbers.
-- ────────────────────────────────────────────────────────────────────
create table if not exists kroger_price_cache (
  location_id text not null,
  query text not null,
  product_id text,
  description text,
  price_cents int,
  sale_price_cents int,
  aisle_number text,
  size_text text,
  -- null = lookup ran but no match found. Distinct from "row absent" so
  -- we don't keep retrying an unfindable ingredient.
  fetched_at timestamptz not null default now(),
  primary key (location_id, query)
);

create index if not exists idx_kroger_price_cache_fetched_at
  on kroger_price_cache (fetched_at);

-- The cache table holds public catalog data, not per-user PII. Read is
-- open to authenticated users; writes go through the server action so we
-- gate at the application layer rather than via RLS rules per user.
alter table kroger_price_cache enable row level security;

drop policy if exists "kroger_price_cache_read" on kroger_price_cache;
create policy "kroger_price_cache_read"
  on kroger_price_cache for select
  to authenticated
  using (true);

drop policy if exists "kroger_price_cache_write" on kroger_price_cache;
create policy "kroger_price_cache_write"
  on kroger_price_cache for all
  to authenticated
  using (true)
  with check (true);

commit;
