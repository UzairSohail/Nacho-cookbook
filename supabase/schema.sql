-- Nacho Cookbook database schema (Supabase / Postgres).
-- Everything belongs to a household; row level security lets members of a
-- household read and write only their household's rows.
-- Mirrors the TypeScript types in src/core/types.ts.

create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our kitchen',
  household_size int not null default 2 check (household_size > 0),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  measure_standard text not null default 'metric' check (measure_standard in ('metric', 'au', 'us')),
  invite_code text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  name text not null,
  aisle text not null default 'other',
  density numeric, -- grams per millilitre, null if unknown
  unique (household_id, name)
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  title text not null,
  description text,
  servings numeric not null check (servings > 0),
  keeps_for_days int,
  prep_minutes int,
  cook_minutes int,
  photo_paths text[] not null default '{}', -- paths in the "recipe-photos" storage bucket
  tags text[] not null default '{}',
  source_url text,
  notes text,
  favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  recipe_id uuid not null references recipes on delete cascade,
  position int not null,
  ingredient_id uuid not null references ingredients,
  quantity numeric,
  unit text,
  note text,
  group_name text,
  scalable boolean not null default true,
  optional boolean not null default false
);

create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  recipe_id uuid not null references recipes on delete cascade,
  position int not null,
  text text not null,
  photo_path text
);

create table plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'dessert')),
  recipe_id uuid references recipes on delete set null,
  note text,
  servings numeric not null check (servings > 0),
  unique (household_id, date, slot)
);

create table pantry_staples (
  household_id uuid not null references households on delete cascade,
  ingredient_id uuid not null references ingredients on delete cascade,
  primary key (household_id, ingredient_id)
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  key text,           -- set for generated lines, null for lines added by hand
  name text not null,
  quantity numeric,
  unit text,
  aisle text not null default 'other',
  checked boolean not null default false,
  edited boolean not null default false,
  sources text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Generated lines someone deleted, so regenerating doesn't bring them back.
create table shopping_dismissed (
  household_id uuid not null references households on delete cascade,
  key text not null,
  primary key (household_id, key)
);

-- Row level security: members only see their household's rows.
create or replace function is_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

alter table households enable row level security;
create policy "members read household" on households for select using (is_member(id));
create policy "members update household" on households for update using (is_member(id));

alter table household_members enable row level security;
create policy "members see members" on household_members for select using (is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array[
    'ingredients', 'recipes', 'recipe_ingredients', 'recipe_steps', 'plan_entries',
    'pantry_staples', 'shopping_items', 'shopping_dismissed'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "household access" on %I for all using (is_member(household_id)) with check (is_member(household_id))',
      t
    );
  end loop;
end $$;

-- Create a household and make the caller its owner.
create or replace function create_household(name text default 'Our kitchen') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  insert into households (name) values (name) returning id into h;
  insert into household_members (household_id, user_id, role) values (h, auth.uid(), 'owner');
  return h;
end $$;

-- Join a household with its invite code.
create or replace function join_household(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from households where invite_code = code;
  if h is null then raise exception 'Invite code not found'; end if;
  insert into household_members (household_id, user_id) values (h, auth.uid()) on conflict do nothing;
  return h;
end $$;
