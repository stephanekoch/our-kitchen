import { babyCheck } from "@/lib/baby-check";
import { requireHousehold, type Ctx } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { removePhoto, signPhotos } from "@/lib/photos";
import { RecipeInput, rowToInput, uuid, type RecipeRow } from "@/lib/recipe-schema";
import { formatQuantity } from "@/lib/shopping";

type Params = { params: Promise<{ id: string }> };

async function recipeId(params: Params["params"]) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Recipe not found");
  return id;
}

async function loadRecipe({ supabase, householdId }: Ctx, id: string): Promise<RecipeRow> {
  const { data, error } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", id)
    .eq("household_id", householdId)
    .order("position", { referencedTable: "recipe_ingredients" })
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "Recipe not found");
  return data as RecipeRow;
}

/** GET /api/recipes/:id — full recipe, baby check and a signed photo URL. */
export const GET = handle(async (_request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const recipe = await loadRecipe(ctx, await recipeId(params));
  const ingredients = (recipe.recipe_ingredients ?? []).map((i) => ({
    ...i,
    quantity: i.quantity == null ? null : Number(i.quantity),
    amount: formatQuantity(i.quantity, i.unit),
  }));
  const signed = await signPhotos(ctx.supabase, [recipe.photo_path]);
  const { recipe_ingredients: _omit, ...rest } = recipe;

  return ok({
    recipe: {
      ...rest,
      ingredients,
      photo_url: recipe.photo_path ? (signed.get(recipe.photo_path) ?? null) : null,
    },
    baby_warnings: babyCheck(ingredients),
  });
});

/** PATCH /api/recipes/:id — any subset of fields; ingredients/instructions replace the old ones. */
export const PATCH = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = await recipeId(params);
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Send an object of fields to change");

  const existing = await loadRecipe(ctx, id);
  const { recipe, ingredients } = RecipeInput.parse({
    ...rowToInput(existing),
    ...(body as Record<string, unknown>),
    source_type: existing.source_type, // where a recipe came from doesn't change
  });

  if (recipe.photo_path && !recipe.photo_path.startsWith(`${ctx.householdId}/`)) {
    throw new HttpError(400, "That photo doesn't belong to your household");
  }

  const { error } = await ctx.supabase.rpc("save_recipe", {
    p_household: ctx.householdId,
    p_recipe: recipe,
    p_ingredients: ingredients,
    p_id: id,
  });
  if (error) throw dbError(error);

  if (existing.photo_path && existing.photo_path !== recipe.photo_path) {
    await removePhoto(ctx.supabase, existing.photo_path);
  }

  return ok({ id, baby_warnings: babyCheck(ingredients) });
});

/** DELETE /api/recipes/:id — also removes its photo. */
export const DELETE = handle(async (_request: Request, { params }: Params) => {
  const { supabase, householdId } = await requireHousehold();
  const id = await recipeId(params);
  const { data, error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", id)
    .eq("household_id", householdId)
    .select("photo_path")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "Recipe not found");
  await removePhoto(supabase, data.photo_path as string | null);
  return new Response(null, { status: 204 });
});
