import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { buildShoppingLines } from "@/lib/shopping";
import { loadActiveList } from "@/lib/shopping-db";

/** GET /api/shopping-lists — the active list (or null). */
export const GET = handle(async () => {
  const ctx = await requireHousehold();
  return ok({ list: await loadActiveList(ctx) });
});

const Body = z.object({
  recipes: z
    .array(z.object({ id: z.uuid(), servings: z.number().int().min(1).max(50).nullish() }))
    .min(1, "Pick at least one recipe")
    .max(30),
  mode: z.enum(["append", "replace"]).default("append"),
  title: z.string().trim().min(1).max(80).nullish(),
});

/**
 * POST /api/shopping-lists { recipes: [{ id, servings? }], mode?: "append" | "replace", title? }
 * Scales each recipe to the servings asked for, merges duplicates, and adds to this week's
 * list ("append") or archives it and starts a fresh one ("replace").
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const body = Body.parse(await readJson(request));
  const ids = [...new Set(body.recipes.map((r) => r.id))];

  const { data, error } = await ctx.supabase
    .from("recipes")
    .select("id,title,servings, recipe_ingredients(name,quantity,unit,category)")
    .eq("household_id", ctx.householdId)
    .in("id", ids);
  if (error) throw dbError(error);
  const found = new Map((data ?? []).map((r) => [r.id as string, r]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new HttpError(404, "Some recipes weren't found", { missing });

  const targets = new Map(body.recipes.map((r) => [r.id, r.servings ?? null]));
  const lines = buildShoppingLines(
    ids.map((id) => {
      const r = found.get(id)!;
      return {
        id,
        servings: (r.servings as number | null) ?? null,
        target: targets.get(id) ?? null,
        ingredients: (r.recipe_ingredients ?? []) as {
          name: string;
          quantity: number | null;
          unit: string | null;
          category: string;
        }[],
      };
    }),
  );

  const { error: writeError } = await ctx.supabase.rpc("write_shopping_list", {
    p_household: ctx.householdId,
    p_mode: body.mode,
    p_items: lines,
    p_recipes: ids.map((id) => ({ recipe_id: id, servings: targets.get(id) ?? found.get(id)!.servings ?? null })),
    p_title: body.title ?? null,
  });
  if (writeError) throw dbError(writeError);

  return ok({ list: await loadActiveList(ctx), added: lines.length }, 201);
});
