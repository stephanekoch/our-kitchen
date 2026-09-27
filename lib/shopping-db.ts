import { CATEGORY_LABELS, categoryRank, type Category } from "./categories";
import type { Ctx } from "./context";
import { dbError } from "./http";
import { formatQuantity } from "./shopping";

type ItemRow = {
  id: string;
  name: string;
  name_key: string;
  quantity: number | string | null;
  unit: string | null;
  category: string;
  source_recipe_ids: string[];
  is_manual: boolean;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  cleared?: boolean;
  created_at: string;
};

/** The household's active list, items grouped in shop-walk order. */
export async function loadActiveList({ supabase, householdId }: Ctx) {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(
      "id,title,created_at, shopping_list_items(*), shopping_list_recipes(recipe_id,servings,added_at, recipes(title))",
    )
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) return null;

  const items = ((data.shopping_list_items ?? []) as ItemRow[])
    .filter((i) => !i.cleared)
    .map((i) => ({
      ...i,
      quantity: i.quantity == null ? null : Number(i.quantity),
      amount: formatQuantity(i.quantity, i.unit),
    }))
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        a.name.localeCompare(b.name, "en-GB"),
    );

  const groups: { category: string; label: string; items: typeof items }[] = [];
  for (const item of items.filter((i) => !i.checked)) {
    let g = groups.find((x) => x.category === item.category);
    if (!g) {
      g = { category: item.category, label: CATEGORY_LABELS[item.category as Category] ?? "Other", items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  type RecipeLink = { recipe_id: string; servings: number | null; added_at: string; recipes: { title: string } | null };
  const recipes = ((data.shopping_list_recipes ?? []) as unknown as RecipeLink[]).map((r) => ({
    id: r.recipe_id,
    title: r.recipes?.title ?? "(deleted recipe)",
    servings: r.servings,
  }));

  return {
    id: data.id as string,
    title: data.title as string,
    created_at: data.created_at as string,
    recipes,
    groups,
    checked: items.filter((i) => i.checked),
    counts: { total: items.length, remaining: items.filter((i) => !i.checked).length },
  };
}

/** 404 unless the list exists and belongs to the household. */
export async function assertList({ supabase, householdId }: Ctx, listId: string) {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("id", listId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw dbError(error);
  return Boolean(data);
}
