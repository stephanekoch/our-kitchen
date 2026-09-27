-- Family recipe book: schema, row-level security, RPCs, photo storage, realtime.
-- Every row belongs to a household; every policy checks the signed-in user is a member.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Households
-- ---------------------------------------------------------------------------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our kitchen',
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- One household per person keeps every query simple.
create unique index household_members_one_per_user on public.household_members (user_id);

create table public.household_invites (
  email        text primary key check (email = lower(email)),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create or replace function public.is_household_member(p_household uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Called after every sign-in: returns the user's household. An invite wins over an empty
-- household of your own (e.g. your partner signed in before you invited them).
create or replace function public.ensure_household()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_household uuid;
  v_invite    uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select household_id into v_household from public.household_members where user_id = v_uid;
  select household_id into v_invite from public.household_invites where email = v_email;

  if v_invite is not null and v_invite is distinct from v_household then
    if v_household is not null then
      -- Only switch if the current household is theirs alone and has nothing in it.
      if exists (select 1 from public.household_members where household_id = v_household and user_id <> v_uid)
         or exists (select 1 from public.recipes where household_id = v_household) then
        return v_household;
      end if;
      delete from public.households where id = v_household;
    end if;
    insert into public.household_members (household_id, user_id, role) values (v_invite, v_uid, 'member');
    delete from public.household_invites where email = v_email;
    return v_invite;
  end if;

  if v_household is not null then
    if v_invite is not null then
      delete from public.household_invites where email = v_email; -- already a member
    end if;
    return v_household;
  end if;

  insert into public.households default values returning id into v_household;
  insert into public.household_members (household_id, user_id, role) values (v_household, v_uid, 'owner');
  return v_household;
end;
$$;
revoke all on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------
create type public.recipe_source as enum ('manual', 'url', 'photo');

create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  description    text,
  servings       smallint check (servings between 1 and 50),
  prep_minutes   smallint check (prep_minutes between 0 and 1440),
  cook_minutes   smallint check (cook_minutes between 0 and 1440),
  total_minutes  smallint check (total_minutes between 0 and 2880),
  instructions   text[] not null default '{}',
  source_type    public.recipe_source not null default 'manual',
  source_url     text,
  image_url      text,           -- remote image from an imported page
  photo_path     text,           -- object in the recipe-photos bucket
  -- Flags
  baby_friendly  boolean not null default false,
  easy           boolean not null default false,
  freezes_well   boolean not null default false,
  quick          boolean generated always as (total_minutes is not null and total_minutes <= 30) stored,
  tags           text[] not null default '{}',
  notes          text,
  search_text    text not null default '',   -- title + ingredient names, maintained by save_recipe()
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index recipes_household_title on public.recipes (household_id, lower(title));
create index recipes_household_source on public.recipes (household_id, source_url) where source_url is not null;
create index recipes_search on public.recipes using gin (search_text extensions.gin_trgm_ops);

create table public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  position   smallint not null,
  raw        text not null,
  quantity   numeric(10,3),
  unit       text,
  name       text not null,
  note       text,
  category   text not null default 'other' check (category in (
               'produce','meat_fish','dairy_eggs','bakery','tins_jars','dry_goods',
               'spices','frozen','drinks','household','other')),
  unique (recipe_id, position)
);

-- Create or replace a recipe and its ingredients in one transaction.
-- security invoker: row-level security applies exactly as for a direct insert.
create or replace function public.save_recipe(
  p_household   uuid,
  p_recipe      jsonb,
  p_ingredients jsonb,
  p_id          uuid default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id           uuid;
  v_search       text;
  v_instructions text[];
  v_tags         text[];
begin
  select lower(concat_ws(' ', p_recipe ->> 'title', string_agg(t.x ->> 'name', ' ')))
    into v_search
    from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as t(x);

  select coalesce(array_agg(s.value order by s.ord), '{}')
    into v_instructions
    from jsonb_array_elements_text(coalesce(p_recipe -> 'instructions', '[]'::jsonb)) with ordinality as s(value, ord);

  select coalesce(array_agg(s.value order by s.ord), '{}')
    into v_tags
    from jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]'::jsonb)) with ordinality as s(value, ord);

  if p_id is null then
    insert into public.recipes (
      household_id, title, description, servings, prep_minutes, cook_minutes, total_minutes,
      instructions, source_type, source_url, image_url, photo_path,
      baby_friendly, easy, freezes_well, tags, notes, search_text
    ) values (
      p_household,
      p_recipe ->> 'title',
      p_recipe ->> 'description',
      (p_recipe ->> 'servings')::smallint,
      (p_recipe ->> 'prep_minutes')::smallint,
      (p_recipe ->> 'cook_minutes')::smallint,
      (p_recipe ->> 'total_minutes')::smallint,
      v_instructions,
      coalesce(p_recipe ->> 'source_type', 'manual')::public.recipe_source,
      p_recipe ->> 'source_url',
      p_recipe ->> 'image_url',
      p_recipe ->> 'photo_path',
      coalesce((p_recipe ->> 'baby_friendly')::boolean, false),
      coalesce((p_recipe ->> 'easy')::boolean, false),
      coalesce((p_recipe ->> 'freezes_well')::boolean, false),
      v_tags,
      p_recipe ->> 'notes',
      v_search
    )
    returning id into v_id;
  else
    update public.recipes set
      title         = p_recipe ->> 'title',
      description   = p_recipe ->> 'description',
      servings      = (p_recipe ->> 'servings')::smallint,
      prep_minutes  = (p_recipe ->> 'prep_minutes')::smallint,
      cook_minutes  = (p_recipe ->> 'cook_minutes')::smallint,
      total_minutes = (p_recipe ->> 'total_minutes')::smallint,
      instructions  = v_instructions,
      source_url    = p_recipe ->> 'source_url',
      image_url     = p_recipe ->> 'image_url',
      photo_path    = p_recipe ->> 'photo_path',
      baby_friendly = coalesce((p_recipe ->> 'baby_friendly')::boolean, false),
      easy          = coalesce((p_recipe ->> 'easy')::boolean, false),
      freezes_well  = coalesce((p_recipe ->> 'freezes_well')::boolean, false),
      tags          = v_tags,
      notes         = p_recipe ->> 'notes',
      search_text   = v_search,
      updated_at    = now()
    where id = p_id and household_id = p_household
    returning id into v_id;

    if v_id is null then
      raise exception 'recipe not found' using errcode = 'P0002';
    end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, raw, quantity, unit, name, note, category)
  select v_id,
         (t.ord - 1)::smallint,
         t.x ->> 'raw',
         (t.x ->> 'quantity')::numeric,
         t.x ->> 'unit',
         t.x ->> 'name',
         t.x ->> 'note',
         coalesce(t.x ->> 'category', 'other')
    from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) with ordinality as t(x, ord);

  return v_id;
end;
$$;
revoke all on function public.save_recipe(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Shopping lists (one active list per household)
-- ---------------------------------------------------------------------------
create table public.shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null default 'This week',
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create unique index shopping_lists_one_active on public.shopping_lists (household_id) where status = 'active';

create table public.shopping_list_recipes (
  list_id   uuid not null references public.shopping_lists(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  servings  smallint,
  added_at  timestamptz not null default now(),
  primary key (list_id, recipe_id)
);

create table public.shopping_list_items (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.shopping_lists(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 200),
  name_key          text not null,          -- normalised name used to merge duplicates
  quantity          numeric(12,3),          -- null = "just need some"
  unit              text,                   -- g, ml, clove, tin... null = count
  category          text not null default 'other',
  source_recipe_ids uuid[] not null default '{}',
  is_manual         boolean not null default false,
  checked           boolean not null default false,
  checked_at        timestamptz,
  checked_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index shopping_list_items_list on public.shopping_list_items (list_id, category);

-- Add aggregated lines to the active list (append) or start a fresh list (replace).
-- Unticked lines with the same name and unit are merged; ticked ones are left alone.
create or replace function public.write_shopping_list(
  p_household uuid,
  p_mode      text,
  p_items     jsonb,
  p_recipes   jsonb,
  p_title     text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_list uuid;
begin
  if p_mode not in ('append', 'replace') then
    raise exception 'mode must be append or replace' using errcode = '22023';
  end if;

  if p_mode = 'replace' then
    update public.shopping_lists
       set status = 'archived', archived_at = now()
     where household_id = p_household and status = 'active';
  end if;

  select id into v_list from public.shopping_lists where household_id = p_household and status = 'active';
  if v_list is null then
    insert into public.shopping_lists (household_id, title)
    values (p_household, coalesce(p_title, 'This week'))
    returning id into v_list;
  end if;

  insert into public.shopping_list_recipes (list_id, recipe_id, servings)
  select v_list, r.recipe_id, r.servings
    from jsonb_to_recordset(coalesce(p_recipes, '[]'::jsonb)) as r(recipe_id uuid, servings smallint)
  on conflict (list_id, recipe_id) do update set servings = coalesce(excluded.servings, public.shopping_list_recipes.servings);

  with n as (
    select *
      from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
        as n(name text, name_key text, quantity numeric, unit text, category text, source_recipe_ids uuid[])
  ),
  upd as (
    update public.shopping_list_items i set
      quantity = case when i.quantity is null or n.quantity is null
                      then coalesce(i.quantity, n.quantity)
                      else i.quantity + n.quantity end,
      source_recipe_ids = array(select distinct e from unnest(i.source_recipe_ids || coalesce(n.source_recipe_ids, '{}')) as e)
    from n
    where i.list_id = v_list
      and not i.checked
      and i.name_key = n.name_key
      and i.unit is not distinct from n.unit
    returning i.name_key, i.unit
  )
  insert into public.shopping_list_items (list_id, name, name_key, quantity, unit, category, source_recipe_ids)
  select v_list, n.name, n.name_key, n.quantity, n.unit, coalesce(n.category, 'other'), coalesce(n.source_recipe_ids, '{}')
    from n
   where not exists (select 1 from upd where upd.name_key = n.name_key and upd.unit is not distinct from n.unit);

  return v_list;
end;
$$;
revoke all on function public.write_shopping_list(uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.write_shopping_list(uuid, text, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.household_invites     enable row level security;
alter table public.recipes               enable row level security;
alter table public.recipe_ingredients    enable row level security;
alter table public.shopping_lists        enable row level security;
alter table public.shopping_list_recipes enable row level security;
alter table public.shopping_list_items   enable row level security;

create policy "members read their household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "members rename their household" on public.households
  for update to authenticated using (public.is_household_member(id)) with check (public.is_household_member(id));

-- Membership rows are only written by ensure_household().
create policy "members see each other" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy "members manage invites" on public.household_invites
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household recipes" on public.recipes
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household recipe ingredients" on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and public.is_household_member(r.household_id)));

create policy "household lists" on public.shopping_lists
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household list recipes" on public.shopping_list_recipes
  for all to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and public.is_household_member(l.household_id)))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and public.is_household_member(l.household_id)));

create policy "household list items" on public.shopping_list_items
  for all to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and public.is_household_member(l.household_id)))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and public.is_household_member(l.household_id)));

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

-- Live ticking: both phones see the list update as items are checked off.
alter table public.shopping_list_items replica identity full;
alter publication supabase_realtime add table public.shopping_list_items;

-- ---------------------------------------------------------------------------
-- Photo storage: recipe-photos/<household_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "household photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (
      select m.household_id::text from public.household_members m where m.user_id = (select auth.uid())
    )
  );

create policy "household photos upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (
      select m.household_id::text from public.household_members m where m.user_id = (select auth.uid())
    )
  );

create policy "household photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (
      select m.household_id::text from public.household_members m where m.user_id = (select auth.uid())
    )
  );
