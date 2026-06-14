-- Persist prep vs cook/bake split separately from total time_min.
alter table recipes
  add column if not exists prep_min int,
  add column if not exists cook_min int;

comment on column recipes.prep_min is 'Active prep time in minutes (chopping, mixing, etc.)';
comment on column recipes.cook_min is 'Passive cook/bake time in minutes (oven, simmer, etc.)';
