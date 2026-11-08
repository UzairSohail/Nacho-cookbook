-- Nacho Cookbook: storage for recipe photos.
-- Run once in the Supabase SQL Editor, after 002_powersync.sql.
-- Safe to run again.
--
-- Photos live in a private "recipe-photos" bucket, in a folder named after the
-- household: <household id>/<photo id>.jpg. Only members of that household can
-- see, add or remove them. Recipes store the path (recipes.photo_paths and
-- recipe_steps.photo_path); the app asks for short-lived signed links to show them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the first folder of a photo's path is a household the caller belongs to.
create or replace function public.is_photo_member(object_name text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id::text = (storage.foldername(object_name))[1]
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_photo_member(text) to authenticated;

drop policy if exists "household photos read" on storage.objects;
drop policy if exists "household photos add" on storage.objects;
drop policy if exists "household photos change" on storage.objects;
drop policy if exists "household photos remove" on storage.objects;

create policy "household photos read" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and public.is_photo_member(name));

create policy "household photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and public.is_photo_member(name));

create policy "household photos change" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and public.is_photo_member(name))
  with check (bucket_id = 'recipe-photos' and public.is_photo_member(name));

create policy "household photos remove" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and public.is_photo_member(name));
