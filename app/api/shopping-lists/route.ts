import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { activeListId, syncList } from "@/lib/list-sync";
import { loadActiveList } from "@/lib/shopping-db";

/** GET /api/shopping-lists — the active list (or null). */
export const GET = handle(async () => {
  const ctx = await requireHousehold();
  return ok({ list: await loadActiveList(ctx) });
});

const Body = z.object({
  recipes: z
    .array(z.object({ id: z.uuid(), servings: z.number().int().min(1).max(50).nullish() }))
    .max(30)
    .default([]), // empty: just make sure there's an active list (for typing items in)
  mode: z.enum(["append", "replace"]).optional(), // accepted for older app versions; ignored
  title: z.string().trim().min(1).max(80).nullish(),
});

/**
 * POST /api/shopping-lists { recipes: [{ id, servings }] }
 * Puts recipes on the list for that many portions. A recipe that's already on it has its
 * portions set rather than being added twice. Ingredients are scaled, merged and sorted by aisle.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const body = Body.parse(await readJson(request));
  const listId = await activeListId(ctx);

  if (body.recipes.length) {
    const ids = [...new Set(body.recipes.map((r) => r.id))];
    const { data, error } = await ctx.supabase.from("recipes").select("id,servings").eq("household_id", ctx.householdId).in("id", ids);
    if (error) throw dbError(error);
    const found = new Map((data ?? []).map((r) => [r.id as string, (r.servings as number | null) ?? null]));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new HttpError(404, "Some recipes weren't found", { missing });

    const rows = body.recipes.map((r) => ({ list_id: listId, recipe_id: r.id, servings: r.servings ?? found.get(r.id) ?? 1 }));
    const { error: linkError } = await ctx.supabase.from("shopping_list_recipes").upsert(rows, { onConflict: "list_id,recipe_id" });
    if (linkError) throw dbError(linkError);
    await syncList(ctx, listId);
  }

  return ok({ list: await loadActiveList(ctx), added: body.recipes.length }, 201);
});
