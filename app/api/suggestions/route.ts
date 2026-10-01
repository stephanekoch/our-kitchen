import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, ok, readJson } from "@/lib/http";
import { signPhotos } from "@/lib/photos";
import { suggestRecipes } from "@/lib/suggest";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  request: z.string().trim().min(1, "Say what you fancy this week").max(1000),
  count: z.number().int().min(1).max(14).nullish(), // 1 = swap a single suggestion
  exclude: z.array(z.uuid()).max(400).default([]), // already shown, rejected or added
});

/**
 * POST /api/suggestions { request, count?, exclude? }
 * Suggests recipes for the week, chosen only from the household's own recipe book.
 */
export const POST = handle(async (request: Request) => {
  const ctx = await requireHousehold();
  const body = Body.parse(await readJson(request));
  const { suggestions, note } = await suggestRecipes(ctx, body.request, { count: body.count, exclude: body.exclude });

  const ids = suggestions.map((s) => s.id);
  let details: Record<string, unknown>[] = [];
  if (ids.length) {
    const { data, error } = await ctx.supabase
      .from("recipes")
      .select("id,title,servings,total_minutes,baby_friendly,easy,quick,freezes_well,image_url,photo_path")
      .eq("household_id", ctx.householdId)
      .in("id", ids);
    if (error) throw dbError(error);
    details = data ?? [];
  }
  const signed = await signPhotos(ctx.supabase, details.map((d) => d.photo_path as string | null));
  const byId = new Map(details.map((d) => [d.id as string, d]));

  return ok({
    note,
    suggestions: suggestions
      .filter((s) => byId.has(s.id))
      .map((s) => {
        const d = byId.get(s.id)!;
        return { ...d, reason: s.reason, photo_url: d.photo_path ? (signed.get(d.photo_path as string) ?? null) : null };
      }),
  });
});
