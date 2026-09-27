import type { Ctx } from "./context";
import { dbError, HttpError } from "./http";

export type TagOption = { id: string; name: string; count: number };
export type TagCategory = { id: string; name: string; options: TagOption[] };

/** The household's categories with their options and how many recipes use each. */
export async function loadTags({ supabase, householdId }: Ctx): Promise<TagCategory[]> {
  const [cats, opts, links] = await Promise.all([
    supabase.from("tag_categories").select("id,name,position,created_at").eq("household_id", householdId),
    supabase.from("tag_options").select("id,category_id,name,position,created_at").eq("household_id", householdId),
    supabase.from("recipe_tags").select("option_id").eq("household_id", householdId),
  ]);
  for (const r of [cats, opts, links]) if (r.error) throw dbError(r.error);
  const counts = new Map<string, number>();
  for (const l of links.data ?? []) counts.set(l.option_id as string, (counts.get(l.option_id as string) ?? 0) + 1);
  const byOrder = (a: { position: number; created_at: string }, b: { position: number; created_at: string }) =>
    a.position - b.position || a.created_at.localeCompare(b.created_at);
  return (cats.data ?? []).sort(byOrder).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    options: (opts.data ?? [])
      .filter((o) => o.category_id === c.id)
      .sort(byOrder)
      .map((o) => ({ id: o.id as string, name: o.name as string, count: counts.get(o.id as string) ?? 0 })),
  }));
}

/** Replace a recipe's tags with these option ids (ignoring any that aren't the household's). */
export async function setRecipeTags({ supabase, householdId }: Ctx, recipeId: string, optionIds: string[]) {
  const ids = [...new Set(optionIds)];
  let valid: string[] = [];
  if (ids.length) {
    const { data, error } = await supabase.from("tag_options").select("id").eq("household_id", householdId).in("id", ids);
    if (error) throw dbError(error);
    valid = (data ?? []).map((o) => o.id as string);
  }
  const { error: delError } = await supabase.from("recipe_tags").delete().eq("recipe_id", recipeId);
  if (delError) throw dbError(delError);
  if (valid.length) {
    const { error } = await supabase
      .from("recipe_tags")
      .insert(valid.map((option_id) => ({ recipe_id: recipeId, option_id, household_id: householdId })));
    if (error) throw dbError(error);
  }
}

export function tagName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HttpError(400, "Give it a name");
  if (name.length > 40) throw new HttpError(400, "Keep it under 40 characters");
  return name;
}

export async function nextPosition(ctx: Ctx, table: "tag_categories" | "tag_options", filter: Record<string, string>) {
  let q = ctx.supabase.from(table).select("position").order("position", { ascending: false }).limit(1);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q;
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1;
}
