-- Panda Chef v1.2. Run once in Supabase → SQL Editor, before uploading the v1.2 code.

-- 1. "Quick" is your choice now, like the other flags (it used to be set automatically at 30 minutes or less).
alter table public.recipes alter column quick drop expression if exists;
alter table public.recipes alter column quick set default false;
update public.recipes set quick = false;

create or replace function public.save_recipe(
  p_household uuid,
  p_recipe jsonb,
  p_ingredients jsonb,
  p_id uuid default null
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
      baby_friendly, easy, quick, freezes_well, tags, notes, search_text
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
      coalesce((p_recipe ->> 'quick')::boolean, false),
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
      quick         = coalesce((p_recipe ->> 'quick')::boolean, false),
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

-- 2. Shopping list: bought-and-cleared lines stay hidden instead of being re-added from their recipe.
alter table public.shopping_list_items add column if not exists cleared boolean not null default false;

-- 3. People: show each member's email in Settings.
alter table public.household_members add column if not exists email text;
update public.household_members m set email = u.email from auth.users u where u.id = m.user_id;

create or replace function public.set_member_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select u.email into new.email from auth.users u where u.id = new.user_id;
  return new;
end;
$$;
drop trigger if exists household_members_email on public.household_members;
create trigger household_members_email before insert on public.household_members
  for each row execute function public.set_member_email();
