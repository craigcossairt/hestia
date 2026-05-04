-- Supabase advisor fixes — security tightening + RLS performance
-- rewrites + foreign-key indexes. Sourced from the database-linter
-- output (Security + Performance categories) after PR #44.
--
-- Sections:
--   A. Security: lock down SECURITY DEFINER functions
--   B. Security: drop bucket-listing policy on recipe-photos
--   C. Performance: covering indexes on FKs to recipes
--   D. Performance: wrap auth.uid() in (select …) on every RLS policy
--   E. Performance: split FOR ALL policies that double-up SELECT

-- ============================================================
-- A. Security: SECURITY DEFINER functions
-- ============================================================

-- handle_new_user fires as an auth.users INSERT trigger to seed a
-- profiles row. There's no reason it should be callable via REST RPC —
-- the trigger fires regardless of grants.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- rls_auto_enable is an event-trigger helper that auto-enables RLS on
-- newly created tables. Same deal — event triggers don't need RPC
-- grants.
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- increment_daily_ai_usage(p_user_id) was trusting its parameter for
-- identity. An authenticated client could call:
--   supabase.rpc('increment_daily_ai_usage', { p_user_id: '<other>' })
-- and burn down another user's quota.
--
-- Replace the body so it ignores the parameter and uses auth.uid()
-- internally. Signature is preserved (same arg type) so the existing
-- TypeScript caller in lib/ai/quota.ts keeps working without a change
-- — the parameter is now decorative.
create or replace function public.increment_daily_ai_usage(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
  uid uuid;
begin
  -- p_user_id is intentionally ignored. Identity always comes from the
  -- caller's session via auth.uid() — never trust the client to identify
  -- itself in a SECURITY DEFINER function. The argument is kept so the
  -- pre-fix TypeScript call (passing { p_user_id: userId }) doesn't
  -- need to be updated atomically with this migration.
  uid := auth.uid();
  if uid is null then
    raise exception 'Authentication required';
  end if;
  insert into daily_ai_usage (user_id, day, count)
  values (uid, current_date, 1)
  on conflict (user_id, day)
    do update set count = daily_ai_usage.count + 1
  returning count into new_count;
  return new_count;
end
$$;

-- ============================================================
-- B. Security: drop bucket-listing policy on recipe-photos
-- ============================================================
-- Public buckets serve files via direct URL without needing a SELECT
-- policy on storage.objects. The existing policy let any client list
-- the entire bucket — exposes more than intended. Hestia never lists
-- bucket contents, just serves the URLs stored in recipes.photo_url.
drop policy if exists "recipe_photos_read" on storage.objects;

-- ============================================================
-- C. Performance: covering indexes on FKs to recipes
-- ============================================================
-- Without these, a recipe DELETE forces a sequential scan on each
-- referencing table to enforce ON DELETE behaviour. Cheap to add
-- and pays back the first time a user deletes a recipe with history.
create index if not exists meal_logs_recipe_id_idx
  on public.meal_logs (recipe_id);
create index if not exists meal_plan_entries_recipe_id_idx
  on public.meal_plan_entries (recipe_id);
create index if not exists recipe_ratings_recipe_id_idx
  on public.recipe_ratings (recipe_id);
create index if not exists saved_recipes_recipe_id_idx
  on public.saved_recipes (recipe_id);

-- ============================================================
-- D. Performance: wrap auth.uid() in (select auth.uid())
-- ============================================================
-- Postgres re-evaluates auth.uid() per row when it appears bare in
-- a policy expression. Wrapping in a subselect lets the planner
-- evaluate it once per query and treat the result as a constant.
-- Negligible at household scale, real win as data grows.
--
-- Rewrite each policy in place — drop, recreate. Brief gap in policy
-- coverage between the two statements; fine since the migration runs
-- in a single transaction in normal apply paths.

drop policy if exists "users see own profile" on public.profiles;
create policy "users see own profile" on public.profiles
  for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "users own pantry" on public.pantry_items;
create policy "users own pantry" on public.pantry_items
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own ratings" on public.recipe_ratings;
create policy "own ratings" on public.recipe_ratings
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own saves" on public.saved_recipes;
create policy "own saves" on public.saved_recipes
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own plan" on public.meal_plan_entries;
create policy "own plan" on public.meal_plan_entries
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own logs" on public.meal_logs;
create policy "own logs" on public.meal_logs
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own insights" on public.insights;
create policy "own insights" on public.insights
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own overrides" on public.grocery_overrides;
create policy "own overrides" on public.grocery_overrides
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own weight" on public.weight_logs;
create policy "own weight" on public.weight_logs
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own grocery purchases" on public.grocery_purchases;
create policy "own grocery purchases" on public.grocery_purchases
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users_read_own_usage" on public.daily_ai_usage;
create policy "users_read_own_usage" on public.daily_ai_usage
  for select
  using ((select auth.uid()) = user_id);

-- ============================================================
-- E. Performance: split FOR ALL policies to remove SELECT doubling
-- ============================================================

-- recipes: "owner can mutate" was FOR ALL, which means it also matched
-- SELECT — and so did "owner or seed visible". Two permissive policies
-- on every SELECT is a per-row cost. Split the mutate policy into the
-- three actual write commands so SELECT is single-policied again.
drop policy if exists "owner or seed visible" on public.recipes;
drop policy if exists "owner can mutate" on public.recipes;
create policy "owner or seed visible" on public.recipes
  for select
  using ((owner_id is null) or (owner_id = (select auth.uid())));
create policy "owner can insert" on public.recipes
  for insert
  with check (owner_id = (select auth.uid()));
create policy "owner can update" on public.recipes
  for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "owner can delete" on public.recipes
  for delete
  using (owner_id = (select auth.uid()));

-- kroger_price_cache: same shape — _read for SELECT and _write for ALL.
-- Split _write into the three write commands so SELECT is no longer
-- doubled. The advisor will still note the always-true on writes (this
-- is a shared cross-user cache by design — any authenticated user can
-- contribute prices), but the SELECT redundancy goes away.
drop policy if exists "kroger_price_cache_write" on public.kroger_price_cache;
create policy "kroger_price_cache_insert" on public.kroger_price_cache
  for insert
  to authenticated
  with check (true);
create policy "kroger_price_cache_update" on public.kroger_price_cache
  for update
  to authenticated
  using (true)
  with check (true);
create policy "kroger_price_cache_delete" on public.kroger_price_cache
  for delete
  to authenticated
  using (true);
