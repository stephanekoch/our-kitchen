import { suggestFlags } from "./baby-check";
import type { ExtractedRecipe } from "./extract/jsonld";
import { normalizeIngredients } from "./ingredients";
import { splitSteps } from "./recipe-schema";

/**
 * An imported recipe, not yet saved. The client shows it on the "Add a recipe" screen for
 * checking, then POSTs it to /api/recipes (the body shape matches RecipeInput).
 */
export function toDraft(
  r: ExtractedRecipe & { freezes_well?: boolean | null },
  source: { source_type: "url" | "photo"; source_url?: string | null; photo_path?: string | null },
) {
  const ingredients = normalizeIngredients(r.ingredients);
  const instructions = splitSteps(r.instructions);
  const total =
    r.total_minutes ?? (r.prep_minutes !== null || r.cook_minutes !== null ? (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) : null);
  const flags = suggestFlags({ ingredients, instructions, total_minutes: total });

  return {
    draft: {
      title: r.title,
      description: r.description,
      servings: r.servings,
      prep_minutes: r.prep_minutes,
      cook_minutes: r.cook_minutes,
      total_minutes: total,
      ingredients,
      instructions,
      source_type: source.source_type,
      source_url: source.source_url ?? null,
      image_url: r.image_url,
      photo_path: source.photo_path ?? null,
      baby_friendly: false,
      easy: flags.easy,
      freezes_well: r.freezes_well ?? false,
      tags: [], // tags are only ever added by you, in the app
      notes: null,
    },
    suggestions: {
      easy: flags.easy,
      quick: flags.quick,
      baby_friendly_ok: flags.baby_friendly_ok,
    },
    baby_warnings: flags.warnings,
  };
}
