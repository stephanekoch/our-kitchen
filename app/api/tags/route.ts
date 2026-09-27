import { z } from "zod";
import { requireHousehold, type Ctx } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";

const Tag = z.string().trim().min(1, "Give the tag a name").max(40).transform((t) => t.toLowerCase());

async function recipesWithTags({ supabase, householdId }: Ctx) {
  const { data, error } = await supabase.from("recipes").select("id,tags").eq("household_id", householdId);
  if (error) throw dbError(error);
  return (data ?? []) as { id: string; tags: string[] }[];
}

async function rewrite(ctx: Ctx, change: (tags: string[]) => string[] | null) {
  let updated = 0;
  for (const r of await recipesWithTags(ctx)) {
    const next = change(r.tags ?? []);
    if (!next) continue;
    const { error } = await ctx.supabase.from("recipes").update({ tags: [...new Set(next)] }).eq("id", r.id);
    if (error) throw dbError(error);
    updated++;
  }
  return updated;
}

/** GET /api/tags — your tags with how many recipes use each. */
export const GET = handle(async () => {
  const ctx = await requireHousehold();
  const counts = new Map<string, number>();
  for (const r of await recipesWithTags(ctx)) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tags = [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, "en-GB"));
  return ok({ tags });
});

/** PATCH /api/tags { from, to } — rename a tag everywhere; renaming onto an existing tag merges them. */
export const PATCH = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const { from, to } = z.object({ from: Tag, to: Tag }).parse(await readJson(request));
  if (from === to) return ok({ updated: 0 });
  const updated = await rewrite(ctx, (tags) => (tags.includes(from) ? tags.map((t) => (t === from ? to : t)) : null));
  if (!updated) throw new HttpError(404, "No recipes have that tag");
  return ok({ updated });
});

/** DELETE /api/tags?tag=… — remove a tag from every recipe. */
export const DELETE = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const tag = Tag.parse(new URL(request.url).searchParams.get("tag") ?? "");
  const updated = await rewrite(ctx, (tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : null));
  return ok({ updated });
});
