-- Migration 0014 — Supabase Storage bucket for user-uploaded recipe photos.
--
-- Sets up the `recipe-photos` bucket so the recipe edit form can upload
-- a custom photo (or replace an AI-generated one). Public read so the
-- existing FoodImage <img src=…> pattern works without signed URLs.
-- Writes are RLS-gated to the recipe owner's folder.
--
-- Path convention enforced at the application layer:
--   {user_id}/{recipe_id}/{timestamp}.{ext}
--
-- Run in the Supabase SQL editor. Idempotent.
--
-- If your project's SQL role can't insert into storage.buckets, create
-- the bucket manually in the Supabase Dashboard (Storage → New bucket
-- → name "recipe-photos", check "Public bucket"), then run only the
-- policy block below.

begin;

-- Create the bucket. Public bucket = anyone can read, but writes are
-- gated by the RLS policies below.
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', true)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────
-- RLS policies on storage.objects, scoped to this bucket only.
-- ────────────────────────────────────────────────────────────────────

-- Anyone authenticated can read (the bucket is also marked public so
-- the <img> tag works for unauthenticated viewers, but we explicitly
-- allow read here too in case the bucket is ever flipped private).
drop policy if exists "recipe_photos_read" on storage.objects;
create policy "recipe_photos_read"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

-- Authenticated users can write only under their own user_id folder.
-- The first path segment must match auth.uid().
drop policy if exists "recipe_photos_write_own" on storage.objects;
create policy "recipe_photos_write_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "recipe_photos_update_own" on storage.objects;
create policy "recipe_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow owners to delete their own uploads (used when replacing or
-- removing the photo from a recipe edit).
drop policy if exists "recipe_photos_delete_own" on storage.objects;
create policy "recipe_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
