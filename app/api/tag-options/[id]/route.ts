import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { uuid } from "@/lib/recipe-schema";
import { loadTags, tagName } from "@/lib/tags";

type Params = { params: Promise<{ id: string }> };

async function option(ctx: Awaited<ReturnType<typeof requireHousehold>>, params: Params["params"]) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Option not found");
  const { data, error } = await ctx.supabase
    .from("tag_options").select("id,category_id,name").eq("id", id).eq("household_id", ctx.householdId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "Option not found");
  return data as { id: string; category_id: string; name: string };
}

/**
 * PATCH /api/tag-options/:id { name } — rename an option. Renaming it to another option in the
 * same category merges the two: its recipes move across and this one is removed.
 */
export const PATCH = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const opt = await option(ctx, params);
  const name = tagName(((await readJson(request)) as { name?: unknown })?.name);
  const { data: target, error: findError } = await ctx.supabase
    .from("tag_options").select("id").eq("category_id", opt.category_id).ilike("name", name.replace(/[\\%_]/g, (c) => `\\${c}`)).neq("id", opt.id).maybeSingle();
  if (findError) throw dbError(findError);

  if (target) {
    const { data: links, error: e1 } = await ctx.supabase.from("recipe_tags").select("recipe_id").eq("option_id", opt.id);
    if (e1) throw dbError(e1);
    if (links?.length) {
      const { error: e2 } = await ctx.supabase.from("recipe_tags").upsert(
        links.map((l) => ({ recipe_id: l.recipe_id, option_id: target.id, household_id: ctx.householdId })),
        { onConflict: "recipe_id,option_id", ignoreDuplicates: true },
      );
      if (e2) throw dbError(e2);
    }
    const { error: e3 } = await ctx.supabase.from("tag_options").delete().eq("id", opt.id);
    if (e3) throw dbError(e3);
    return ok({ merged: true, categories: await loadTags(ctx) });
  }

  const { error } = await ctx.supabase.from("tag_options").update({ name }).eq("id", opt.id);
  if (error) throw dbError(error);
  return ok({ merged: false, categories: await loadTags(ctx) });
});

/** DELETE /api/tag-options/:id — remove an option from every recipe. */
export const DELETE = handle(async (_request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const opt = await option(ctx, params);
  const { error } = await ctx.supabase.from("tag_options").delete().eq("id", opt.id);
  if (error) throw dbError(error);
  return ok({ categories: await loadTags(ctx) });
});
