import { z } from "zod";
import { CATEGORIES } from "./categories";
import { normalizeIngredients, type Ingredient } from "./ingredients";
import { ingredientToMetric, textToMetric } from "./metric";

const minutes = z.number().int().min(0).max(1440).nullish();

const IngredientObject = z.object({
  raw: z.string().trim().max(300).nullish(),
  quantity: z.number().positive().max(100000).nullish(),
  unit: z.string().trim().max(20).nullish(),
  name: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(300).nullish(),
  category: z.enum(CATEGORIES).nullish(),
});

/** "1. Chop the onion\n2. Fry it" → ["Chop the onion", "Fry it"] */
export function splitSteps(input: string | string[]): string[] {
  const lines = typeof input === "string" ? input.split(/\r?\n+/) : input;
  return lines
    .map((s) =>
      s
        .replace(/^\s*(?:step\s*)?\d+\s*[.):-]?\s+/i, "")
        .replace(/^\s*[-•*]\s*/, "")
        .trim(),
    )
    .filter(Boolean)
    .map((s) => s.slice(0, 2000))
    .slice(0, 60);
}

export const RecipeInput = z
  .object({
    title: z.string().trim().min(1, "Give the recipe a name").max(200),
    description: z.string().trim().max(2000).nullish(),
    servings: z.number().int().min(1).max(50).nullish(),
    prep_minutes: minutes,
    cook_minutes: minutes,
    total_minutes: z.number().int().min(0).max(2880).nullish(),
    ingredients: z
      .union([z.string().max(20000), z.array(z.union([z.string().max(300), IngredientObject])).max(80)])
      .default([]),
    instructions: z.union([z.string().max(40000), z.array(z.string()).max(60)]).default([]),
    source_type: z.enum(["manual", "url", "photo"]).default("manual"),
    source_url: z.url({ protocol: /^https?$/ }).max(2000).nullish(),
    image_url: z.url({ protocol: /^https?$/ }).max(2000).nullish(),
    photo_path: z.string().max(300).nullish(),
    baby_friendly: z.boolean().default(false),
    easy: z.boolean().default(false),
    quick: z.boolean().default(false),
    freezes_well: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    notes: z.string().trim().max(5000).nullish(),
  })
  .transform((r) => {
    const ingredients: Ingredient[] = normalizeIngredients(r.ingredients).map(ingredientToMetric);
    const instructions = splitSteps(r.instructions).map(textToMetric);
    const total =
      r.total_minutes ??
      (r.prep_minutes != null || r.cook_minutes != null ? (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) : null);
    const recipe = {
      title: r.title,
      description: r.description || null,
      servings: r.servings ?? null,
      prep_minutes: r.prep_minutes ?? null,
      cook_minutes: r.cook_minutes ?? null,
      total_minutes: total,
      instructions,
      source_type: r.source_type,
      source_url: r.source_url ?? null,
      image_url: r.image_url ?? null,
      photo_path: r.photo_path ?? null,
      baby_friendly: r.baby_friendly,
      easy: r.easy,
      quick: r.quick,
      freezes_well: r.freezes_well,
      tags: [...new Set(r.tags.map((t) => t.toLowerCase()))],
      notes: r.notes || null,
    };
    return { recipe, ingredients };
  });

export type RecipeRecord = z.output<typeof RecipeInput>["recipe"];

export type IngredientRow = {
  position: number;
  raw: string;
  quantity: number | string | null;
  unit: string | null;
  name: string;
  note: string | null;
  category: string;
};

export type RecipeRow = Omit<RecipeRecord, "source_type"> & {
  id: string;
  household_id: string;
  source_type: "manual" | "url" | "photo";
  created_at: string;
  updated_at: string;
  recipe_ingredients?: IngredientRow[];
};

/** For PATCH: the stored recipe in the same shape RecipeInput accepts. */
export function rowToInput(row: RecipeRow): Record<string, unknown> {
  const { id, household_id, created_at, updated_at, recipe_ingredients, ...rest } = row;
  return {
    ...rest,
    ingredients: (recipe_ingredients ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        raw: i.raw,
        quantity: i.quantity == null ? null : Number(i.quantity),
        unit: i.unit,
        name: i.name,
        note: i.note,
        category: i.category,
      })),
  };
}

export const uuid = z.uuid();
