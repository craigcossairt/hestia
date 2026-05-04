-- Migration 0008 — beverage slot + grocery spend tracking
--
-- Adds:
--   1. 'beverage' to meal_plan_entries.slot and meal_logs.slot check
--      constraints (juice, beer, smoothies, gatorade, etc; sets up future
--      hydration tracking).
--   2. grocery_purchases table — one row per shopping trip. Drives the
--      grocery-spend card on Stats.
--
-- Idempotent: safe to re-run.

alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_slot_check;
alter table meal_plan_entries
  add constraint meal_plan_entries_slot_check
  check (slot in ('breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'beverage'));

alter table meal_logs
  drop constraint if exists meal_logs_slot_check;
alter table meal_logs
  add constraint meal_logs_slot_check
  check (slot is null or slot in ('breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'beverage'));

create table if not exists grocery_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  note text,
  purchased_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index if not exists grocery_purchases_user_idx
  on grocery_purchases(user_id, purchased_at desc);

alter table grocery_purchases enable row level security;

drop policy if exists "own grocery purchases" on grocery_purchases;
create policy "own grocery purchases"
  on grocery_purchases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
