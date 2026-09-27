import type { Ctx } from "./context";
import { dbError, HttpError } from "./http";
import { buildShoppingLines } from "./shopping";

type ItemRow = {
  id: string;
  name_key: string;
  quantity: number | string | null;
  unit: string | null;
  source_recipe_ids: string[];
  is_manual: boolean;
};

const lineKey = (key: string, unit: string | null) => `${key}|${unit ?? ""}`;
const sameQty = (a: number | string | null, b: number | null) => (a == null && b == null) || Number(a) === b;
const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** The household's active list, created if there isn't one. */
export async function activeListId(ctx: Ctx): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("write_shopping_list", {
    p_household: ctx.householdId,
    p_mode: "append",
    p_items: [],
    p_recipes: [],
    p_title: null,
  });
  if (error) throw dbError(error);
  return data as string;
}

/**
 * Rebuild the recipe part of a list from the recipes on it and their portions.
 * Your own items, items you've edited (they become your own), ticks and cleared
 * (bought) lines are kept; lines no recipe needs any more are removed.
 */
export async function syncList(ctx: Ctx, listId: string) {
  const { supabase, householdId } = ctx;
  const { data: links, error: linkError } = await supabase.from("shopping_list_recipes").select("recipe_id,servings").eq("list_id", listId);
  if (linkError) throw dbError(linkError);
  const ids = (links ?? []).map((l) => l.recipe_id as string);

  let recipes: { id: string; servings: number | null; recipe_ingredients: { name: string; quantity: number | null; unit: string | null; category: string }[] }[] = [];
  if (ids.length) {
    const { data, error } = await supabase
      .from("recipes")
      .select("id,servings, recipe_ingredients(name,quantity,unit,category)")
      .eq("household_id", householdId)
      .in("id", ids);
    if (error) throw dbError(error);
    recipes = (data ?? []) as typeof recipes;
  }
  const portions = new Map((links ?? []).map((l) => [l.recipe_id as string, (l.servings as number | null) ?? null]));
  const lines = buildShoppingLines(
    recipes.map((r) => ({ id: r.id, servings: r.servings, target: portions.get(r.id) ?? r.servings, ingredients: r.recipe_ingredients ?? [] })),
  );

  const { data: rows, error: itemError } = await supabase
    .from("shopping_list_items")
    .select("id,name_key,quantity,unit,source_recipe_ids,is_manual")
    .eq("list_id", listId);
  if (itemError) throw dbError(itemError);
  const items = (rows ?? []) as ItemRow[];

  const manual = new Set(items.filter((i) => i.is_manual).map((i) => lineKey(i.name_key, i.unit)));
  const derived = new Map<string, ItemRow>();
  const duplicates: string[] = [];
  for (const i of items.filter((x) => !x.is_manual)) {
    const k = lineKey(i.name_key, i.unit);
    if (derived.has(k)) duplicates.push(i.id);
    else derived.set(k, i);
  }

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; quantity: number | null; source_recipe_ids: string[] }[] = [];
  for (const line of lines) {
    const k = lineKey(line.name_key, line.unit);
    if (manual.has(k)) continue; // you've taken this one over
    const existing = derived.get(k);
    if (!existing) {
      inserts.push({ list_id: listId, ...line });
      continue;
    }
    derived.delete(k);
    if (!sameQty(existing.quantity, line.quantity) || !sameIds(existing.source_recipe_ids ?? [], line.source_recipe_ids)) {
      updates.push({ id: existing.id, quantity: line.quantity, source_recipe_ids: line.source_recipe_ids });
    }
  }
  const deletes = [...duplicates, ...[...derived.values()].map((i) => i.id)];

  if (inserts.length) {
    const { error } = await supabase.from("shopping_list_items").insert(inserts);
    if (error) throw dbError(error);
  }
  for (const u of updates) {
    const { error } = await supabase.from("shopping_list_items").update({ quantity: u.quantity, source_recipe_ids: u.source_recipe_ids }).eq("id", u.id);
    if (error) throw dbError(error);
  }
  if (deletes.length) {
    const { error } = await supabase.from("shopping_list_items").delete().in("id", deletes);
    if (error) throw dbError(error);
  }
}

/** After shopping: recipes with nothing left to buy come off the list. */
export async function dropFinishedRecipes(ctx: Ctx, listId: string) {
  const { supabase } = ctx;
  const [{ data: links, error: e1 }, { data: open, error: e2 }] = await Promise.all([
    supabase.from("shopping_list_recipes").select("recipe_id").eq("list_id", listId),
    supabase.from("shopping_list_items").select("source_recipe_ids").eq("list_id", listId).eq("is_manual", false).eq("cleared", false).eq("checked", false),
  ]);
  if (e1 || e2) throw dbError((e1 ?? e2)!);
  const stillNeeded = new Set((open ?? []).flatMap((i) => (i.source_recipe_ids as string[]) ?? []));
  const done = (links ?? []).map((l) => l.recipe_id as string).filter((id) => !stillNeeded.has(id));
  if (done.length) {
    const { error } = await supabase.from("shopping_list_recipes").delete().eq("list_id", listId).in("recipe_id", done);
    if (error) throw dbError(error);
  }
}

export async function assertRecipeOnList(ctx: Ctx, listId: string, recipeId: string) {
  const { data, error } = await ctx.supabase.from("shopping_list_recipes").select("recipe_id").eq("list_id", listId).eq("recipe_id", recipeId).maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "That recipe isn't on the list");
}
