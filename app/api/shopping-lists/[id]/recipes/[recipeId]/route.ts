import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { assertRecipeOnList, syncList } from "@/lib/list-sync";
import { uuid } from "@/lib/recipe-schema";
import { assertList, loadActiveList } from "@/lib/shopping-db";

type Params = { params: Promise<{ id: string; recipeId: string }> };

async function ids(params: Params["params"]) {
  const { id, recipeId } = await params;
  if (!uuid.safeParse(id).success || !uuid.safeParse(recipeId).success) throw new HttpError(404, "Not found");
  return { id, recipeId };
}

/** PATCH /api/shopping-lists/:id/recipes/:recipeId { servings } — change how many portions to shop for. */
export const PATCH = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const { id, recipeId } = await ids(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const { servings } = z.object({ servings: z.number().int().min(1).max(50) }).parse(await readJson(request));
  await assertRecipeOnList(ctx, id, recipeId);
  const { error } = await ctx.supabase.from("shopping_list_recipes").update({ servings }).eq("list_id", id).eq("recipe_id", recipeId);
  if (error) throw dbError(error);
  await syncList(ctx, id);
  return ok({ list: await loadActiveList(ctx) });
});

/** DELETE /api/shopping-lists/:id/recipes/:recipeId — take a recipe (and what only it needed) off the list. */
export const DELETE = handle(async (_request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const { id, recipeId } = await ids(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const { error } = await ctx.supabase.from("shopping_list_recipes").delete().eq("list_id", id).eq("recipe_id", recipeId);
  if (error) throw dbError(error);
  await syncList(ctx, id);
  return ok({ list: await loadActiveList(ctx) });
});
