import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { uuid } from "@/lib/recipe-schema";
import { loadTags, nextPosition, tagName } from "@/lib/tags";

/** POST /api/tags/:id/options { name } — add an option to a category, e.g. "Asian" to Type. */
export const POST = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireHousehold();
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Category not found");
  const name = tagName(((await readJson(request)) as { name?: unknown })?.name);
  const position = await nextPosition(ctx, "tag_options", { category_id: id });
  const { error } = await ctx.supabase.from("tag_options").insert({ category_id: id, household_id: ctx.householdId, name, position });
  if (error) {
    if (error.code === "23505") throw new HttpError(409, `“${name}” is already an option here`);
    if (error.code === "42501") throw new HttpError(404, "Category not found");
    throw dbError(error);
  }
  return ok({ categories: await loadTags(ctx) }, 201);
});
