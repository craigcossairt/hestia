-- Migration 0015 — Kroger Phase 2: user-level OAuth tokens.
--
-- Phase 1 used client_credentials (server-only) for locations + product
-- search. Phase 2 lets the user authorise our app on the Kroger side
-- so we can write to their cart. That requires user-level OAuth with
-- access + refresh tokens stored against the profile.
--
-- Token columns are PII-sensitive. RLS scopes the profiles table per
-- user already, but we keep them on `profiles` rather than a separate
-- table because:
--   - tokens are 1:1 with the user (no need for an array)
--   - they expire / rotate, not append-only
--   - they're always read alongside the rest of the profile
--
-- Run in the Supabase SQL editor. Idempotent.

begin;

alter table profiles
  add column if not exists kroger_access_token text,
  add column if not exists kroger_refresh_token text,
  add column if not exists kroger_token_expires_at timestamptz,
  -- Kroger sends back a profile id on profile.compact-scoped tokens;
  -- we store it for display ("connected as kroger user XXXX") rather
  -- than for any auth purpose.
  add column if not exists kroger_user_id text;

commit;
