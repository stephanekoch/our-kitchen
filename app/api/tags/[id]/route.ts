import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { uuid } from "@/lib/recipe-schema";
import { loadTags, tagName } from "@/lib/tags";

type Params = { params: Promise<{ id: string }> };

async function categoryId(params: Params["params"]) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Category not found");
  return id;
}

/** PATCH /api/tags/:id { name } — rename a category. */
export const PATCH = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = await categoryId(params);
  const name = tagName(((await readJson(request)) as { name?: unknown })?.name);
  const { data, error } = await ctx.supabase
    .from("tag_categories").update({ name }).eq("id", id).eq("household_id", ctx.householdId).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, `You already have a category called “${name}”`);
    throw dbError(error);
  }
  if (!data) throw new HttpError(404, "Category not found");
  return ok({ categories: await loadTags(ctx) });
});

/** DELETE /api/tags/:id — delete a category and its options (recipes stay). */
export const DELETE = handle(async (_request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = await categoryId(params);
  const { error } = await ctx.supabase.from("tag_categories").delete().eq("id", id).eq("household_id", ctx.householdId);
  if (error) throw dbError(error);
  return ok({ categories: await loadTags(ctx) });
});
