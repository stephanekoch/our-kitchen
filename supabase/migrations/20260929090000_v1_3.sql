-- Panda Chef v1.3. Run once in Supabase → SQL Editor, before uploading the v1.3 code.

-- 1. Two-level tags: categories (Type, Ingredients…) and the options in each (Asian, Seafood…).
create table if not exists public.tag_categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.tag_options (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.tag_categories(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (category_id, name)
);

create table if not exists public.recipe_tags (
  recipe_id    uuid not null references public.recipes(id) on delete cascade,
  option_id    uuid not null references public.tag_options(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  primary key (recipe_id, option_id)
);
create index if not exists recipe_tags_option_idx on public.recipe_tags (option_id);

-- 2. Cooking history, for "You've cooked this 4 times".
create table if not exists public.cook_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id    uuid references public.recipes(id) on delete set null,
  cooked_by    uuid default auth.uid(),
  cooked_at    timestamptz not null default now()
);
create index if not exists cook_log_household_idx on public.cook_log (household_id, cooked_at desc);

alter table public.tag_categories enable row level security;
alter table public.tag_options    enable row level security;
alter table public.recipe_tags    enable row level security;
alter table public.cook_log       enable row level security;

drop policy if exists "household tag categories" on public.tag_categories;
create policy "household tag categories" on public.tag_categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "household tag options" on public.tag_options;
create policy "household tag options" on public.tag_options
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and exists (select 1 from public.tag_categories c where c.id = category_id and c.household_id = tag_options.household_id)
  );

drop policy if exists "household recipe tags" on public.recipe_tags;
create policy "household recipe tags" on public.recipe_tags
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (
    public.is_household_member(household_id)
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.household_id = recipe_tags.household_id)
    and exists (select 1 from public.tag_options o where o.id = option_id and o.household_id = recipe_tags.household_id)
  );

drop policy if exists "household cook log" on public.cook_log;
create policy "household cook log" on public.cook_log
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.tag_categories, public.tag_options, public.recipe_tags, public.cook_log to authenticated;

-- 3. Any single-level tags from v1.1–v1.2 move into a category called "Tags", so nothing is lost.
insert into public.tag_categories (household_id, name)
select distinct household_id, 'Tags' from public.recipes where cardinality(tags) > 0
on conflict do nothing;

insert into public.tag_options (category_id, household_id, name)
select distinct c.id, r.household_id, left(t, 40)
from public.recipes r
cross join unnest(r.tags) as t
join public.tag_categories c on c.household_id = r.household_id and c.name = 'Tags'
on conflict do nothing;

insert into public.recipe_tags (recipe_id, option_id, household_id)
select r.id, o.id, r.household_id
from public.recipes r
cross join unnest(r.tags) as t
join public.tag_categories c on c.household_id = r.household_id and c.name = 'Tags'
join public.tag_options o on o.category_id = c.id and o.name = left(t, 40)
on conflict do nothing;
