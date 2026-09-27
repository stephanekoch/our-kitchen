import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { loadTags, nextPosition, tagName } from "@/lib/tags";

/** GET /api/tags — categories, their options and how many recipes use each. */
export const GET = handle(async () => {
  const ctx = await requireHousehold();
  return ok({ categories: await loadTags(ctx) });
});

/** POST /api/tags { name } — a new category, e.g. "Type". */
export const POST = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const name = tagName(((await readJson(request)) as { name?: unknown })?.name);
  const position = await nextPosition(ctx, "tag_categories", { household_id: ctx.householdId });
  const { data, error } = await ctx.supabase
    .from("tag_categories")
    .insert({ household_id: ctx.householdId, name, position })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, `You already have a category called “${name}”`);
    throw dbError(error);
  }
  return ok({ id: data.id, categories: await loadTags(ctx) }, 201);
});
