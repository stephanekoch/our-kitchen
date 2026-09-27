import type { Ingredient } from "./ingredients";
import { nameKey } from "./ingredients";
import type { Supabase } from "./supabase/server";

/** Every ingredient name the household uses, grouped by what you'd buy, most common spelling first. */
export async function knownIngredients(supabase: Supabase) {
  // Row-level security limits this to the household's own recipes.
  const { data, error } = await supabase.from("recipe_ingredients").select("name").limit(10000);
  if (error) throw error;
  const byKey = new Map<string, Map<string, number>>();
  for (const row of data ?? []) {
    const name = String(row.name).trim();
    const key = nameKey(name);
    if (!key) continue;
    const spellings = byKey.get(key) ?? new Map<string, number>();
    spellings.set(name, (spellings.get(name) ?? 0) + 1);
    byKey.set(key, spellings);
  }
  return [...byKey.entries()]
    .map(([key, spellings]) => {
      const [name, count] = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const total = [...spellings.values()].reduce((a, b) => a + b, 0);
      return { key, name: name.toLowerCase() === name ? name : name.charAt(0).toLowerCase() + name.slice(1), count: total || count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en-GB"));
}

/** Use the household's usual spelling ("red onions") when a new recipe says "Red Onion". */
export async function canonicalise(supabase: Supabase, ingredients: Ingredient[]): Promise<Ingredient[]> {
  let known: Awaited<ReturnType<typeof knownIngredients>>;
  try {
    known = await knownIngredients(supabase);
  } catch {
    return ingredients;
  }
  const map = new Map(known.map((k) => [k.key, k.name]));
  return ingredients.map((i) => {
    const usual = map.get(nameKey(i.name));
    return usual && usual !== i.name ? { ...i, name: usual } : i;
  });
}
