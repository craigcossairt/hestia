-- Hestia — initial schema
-- All user-owned tables enforce RLS via auth.uid().
-- Recipes have dual ownership: owner_id NULL = global seed visible to all users.

-- ────────────────────────────────────────────────────────────────────
-- profiles
-- ────────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  sex text check (sex in ('male', 'female', 'other')),
  age int,
  height_cm numeric,
  weight_kg numeric,
  activity text check (activity in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal text check (goal in ('lose', 'maintain', 'build', 'energy')),
  kcal_target int,
  protein_target int,
  carbs_target int,
  fat_target int,
  dietary_restrictions text[] default '{}',
  schedule_json jsonb default '{}'::jsonb,
  accent_preset text default 'charcoal',
  dark_mode boolean default false,
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;

drop policy if exists "users see own profile" on profiles;
create policy "users see own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────
-- pantry_items
-- ────────────────────────────────────────────────────────────────────

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location text not null default 'pantry'
    check (location in ('pantry', 'fridge', 'freezer', 'spices')),
  qty numeric default 1,
  unit text default 'each',
  added_at timestamptz default now(),
  expires_at timestamptz,
  photo_url text,
  source text default 'manual'
    check (source in ('manual', 'scan', 'receipt', 'bulk'))
);
create index if not exists pantry_items_user_id_idx on pantry_items(user_id);

alter table pantry_items enable row level security;

drop policy if exists "users own pantry" on pantry_items;
create policy "users own pantry"
  on pantry_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- recipes (dual: NULL owner = seed library)
-- ────────────────────────────────────────────────────────────────────

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  photo_url text,
  source_url text,
  ingredients_json jsonb not null default '[]'::jsonb,
  steps_json jsonb not null default '[]'::jsonb,
  kcal int,
  protein int,
  carbs int,
  fat int,
  time_min int,
  tags text[] default '{}',
  created_at timestamptz default now()
);
create index if not exists recipes_owner_id_idx on recipes(owner_id);

alter table recipes enable row level security;

drop policy if exists "owner or seed visible" on recipes;
create policy "owner or seed visible"
  on recipes for select
  using (owner_id is null or owner_id = auth.uid());

drop policy if exists "owner can mutate" on recipes;
create policy "owner can mutate"
  on recipes for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────
-- recipe_ratings
-- ────────────────────────────────────────────────────────────────────

create table if not exists recipe_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  notes text,
  updated_at timestamptz default now(),
  primary key (user_id, recipe_id)
);

alter table recipe_ratings enable row level security;

drop policy if exists "own ratings" on recipe_ratings;
create policy "own ratings"
  on recipe_ratings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- saved_recipes
-- ────────────────────────────────────────────────────────────────────

create table if not exists saved_recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  saved_at timestamptz default now(),
  primary key (user_id, recipe_id)
);

alter table saved_recipes enable row level security;

drop policy if exists "own saves" on saved_recipes;
create policy "own saves"
  on saved_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- meal_plan_entries
-- ────────────────────────────────────────────────────────────────────

create table if not exists meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes(id) on delete set null,
  status text default 'planned' check (status in ('planned', 'logged', 'skipped')),
  created_at timestamptz default now()
);
create index if not exists meal_plan_user_date_idx on meal_plan_entries(user_id, date);

alter table meal_plan_entries enable row level security;

drop policy if exists "own plan" on meal_plan_entries;
create policy "own plan"
  on meal_plan_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- meal_logs (ad-hoc logged meals not tied to plan)
-- ────────────────────────────────────────────────────────────────────

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  recipe_id uuid references recipes(id) on delete set null,
  custom_name text,
  kcal int,
  protein int,
  carbs int,
  fat int
);
create index if not exists meal_logs_user_logged_idx on meal_logs(user_id, logged_at desc);

alter table meal_logs enable row level security;

drop policy if exists "own logs" on meal_logs;
create policy "own logs"
  on meal_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- insights (AI-generated nudges)
-- ────────────────────────────────────────────────────────────────────

create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz default now(),
  dismissed_at timestamptz
);
create index if not exists insights_user_id_idx on insights(user_id);

alter table insights enable row level security;

drop policy if exists "own insights" on insights;
create policy "own insights"
  on insights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- grocery_overrides (overlay state on derived list)
-- ────────────────────────────────────────────────────────────────────

create table if not exists grocery_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  checked boolean default false,
  custom_qty text,
  updated_at timestamptz default now(),
  primary key (user_id, item_key)
);

alter table grocery_overrides enable row level security;

drop policy if exists "own overrides" on grocery_overrides;
create policy "own overrides"
  on grocery_overrides for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
