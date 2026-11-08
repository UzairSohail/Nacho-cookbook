-- Nacho Cookbook: prepare the database for PowerSync offline sync.
-- Run once in the Supabase SQL Editor, after schema.sql.
-- Safe to run again: every step checks whether it has already been done.

-- 1. PowerSync needs a single "id" column on every table it syncs.
--    Three tables used two-column keys; give them an id and keep the old key unique.
do $$
declare t text;
begin
  foreach t in array array['household_members', 'pantry_staples', 'shopping_dismissed'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'id'
    ) then
      execute format('alter table %I drop constraint %I', t, t || '_pkey');
      execute format('alter table %I add column id uuid not null default gen_random_uuid() primary key', t);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_members_household_user_key') then
    alter table household_members add constraint household_members_household_user_key unique (household_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pantry_staples_household_ingredient_key') then
    alter table pantry_staples add constraint pantry_staples_household_ingredient_key unique (household_id, ingredient_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shopping_dismissed_household_key_key') then
    alter table shopping_dismissed add constraint shopping_dismissed_household_key_key unique (household_id, key);
  end if;
end $$;

-- 2. Let signed-in people read and write through the app (row level security still
--    limits them to their own household). Newer Supabase projects don't grant this by default.
grant usage on schema public to authenticated;
grant select, update on households to authenticated;
grant select on household_members to authenticated;
grant select, insert, update, delete on
  ingredients, recipes, recipe_ingredients, recipe_steps, plan_entries,
  pantry_staples, shopping_items, shopping_dismissed
  to authenticated;
grant execute on function create_household(text), join_household(text) to authenticated;

-- 3. Keep updated_at current so "last edit wins" is visible in the data.
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists recipes_touch on recipes;
create trigger recipes_touch before update on recipes for each row execute function touch_updated_at();
drop trigger if exists shopping_items_touch on shopping_items;
create trigger shopping_items_touch before update on shopping_items for each row execute function touch_updated_at();

-- PowerSync's "Set Up with Supabase" button creates its database user and the
-- "powersync" publication for you. If you set it up by hand instead, see
-- docs/powersync-setup.md for the two extra statements.
