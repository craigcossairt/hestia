-- Corrective for migration 0020. Applied via MCP after 0020 was already
-- in production — the original 0020's REVOKE EXECUTE FROM anon,
-- authenticated didn't fully restrict the SECURITY DEFINER functions
-- because Postgres' default for new functions is GRANT EXECUTE TO
-- PUBLIC, which both roles inherit from. Must REVOKE FROM PUBLIC
-- explicitly, then re-grant only where needed.
--
-- This file mirrors the MCP-applied corrective so the local migrations
-- directory matches the remote schema_migrations table (Supabase
-- Preview's branch check requires a clean 1:1 mapping).
--
-- New self-hosters running migrations from scratch don't need this —
-- the 0020 file in this directory was patched (PR after #45) to
-- already include the REVOKE FROM PUBLIC fix. This file is purely a
-- production-history artefact and is idempotent on any state.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.increment_daily_ai_usage(uuid) from public, anon, authenticated;

grant execute on function public.increment_daily_ai_usage(uuid) to authenticated;
