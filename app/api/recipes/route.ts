import { babyCheck } from "@/lib/baby-check";
import { canonicalise } from "@/lib/canonical";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { signPhotos } from "@/lib/photos";
import { RecipeInput } from "@/lib/recipe-schema";

const LIST_COLUMNS =
  "id,title,description,servings,total_minutes,baby_friendly,easy,quick,freezes_well,tags,image_url,photo_path,source_type,updated_at";

const FLAG_COLUMNS: Record<string, string> = {
  baby: "baby_friendly",
  easy: "easy",
  quick: "quick",
  freezes: "freezes_well",
};

/** GET /api/recipes?flags=baby,easy&q=chicken&tag=pasta */
export const GET = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();
  const params = new URL(request.url).searchParams;

  let query = supabase.from("recipes").select(LIST_COLUMNS).eq("household_id", householdId);

  for (const flag of (params.get("flags") ?? "").split(",").map((f) => f.trim()).filter(Boolean)) {
    const column = FLAG_COLUMNS[flag];
    if (!column) throw new HttpError(400, `Unknown flag "${flag}" (use ${Object.keys(FLAG_COLUMNS).join(", ")})`);
    query = query.eq(column, true);
  }

  const tag = params.get("tag")?.trim().toLowerCase();
  if (tag) query = query.contains("tags", [tag]);

  // Every word must appear in the title or an ingredient name (trigram-indexed).
  const words = (params.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  for (const w of words) {
    query = query.ilike("search_text", `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  const sort = params.get("sort") === "recent" ? "updated_at" : "title";
  const { data, error } = await query.order(sort, { ascending: sort === "title" }).limit(500);
  if (error) throw dbError(error);

  const signed = await signPhotos(supabase, data.map((r) => r.photo_path));
  return ok({
    recipes: data.map((r) => ({ ...r, photo_url: r.photo_path ? (signed.get(r.photo_path) ?? null) : null })),
  });
});

/** POST /api/recipes — manual entry, or saving a checked import draft. */
export const POST = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();
  const parsed = RecipeInput.parse(await readJson(request));
  const recipe = parsed.recipe;
  const ingredients = await canonicalise(supabase, parsed.ingredients);

  if (recipe.photo_path && !recipe.photo_path.startsWith(`${householdId}/`)) {
    throw new HttpError(400, "That photo doesn't belong to your household");
  }

  const { data: id, error } = await supabase.rpc("save_recipe", {
    p_household: householdId,
    p_recipe: recipe,
    p_ingredients: ingredients,
  });
  if (error) throw dbError(error);

  return ok({ id, baby_warnings: babyCheck(ingredients) }, 201);
});
