import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { toDraft } from "@/lib/draft";
import { extractFromPageText } from "@/lib/extract/claude";
import { fetchPage } from "@/lib/extract/fetch-page";
import { extractJsonLdRecipe, htmlToText, metaContent } from "@/lib/extract/jsonld";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ url: z.url({ protocol: /^https?$/ }).max(2000) });

/** Drop tracking parameters so the same recipe shared twice is spotted as a duplicate. */
function canonical(url: string): string {
  const u = new URL(url);
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|ref$|igshid|si$)/i.test(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

/**
 * POST /api/recipes/import-url { url }
 * Returns an unsaved draft. Tries the page's schema.org markup first (free, instant),
 * then falls back to Claude reading the page text.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();
  const { url } = Body.parse(await readJson(request));

  const page = await fetchPage(url);
  const sourceUrl = canonical(metaContent(page.html, "og:url") ?? page.url);

  let method: "structured-data" | "ai" = "structured-data";
  let recipe = extractJsonLdRecipe(page.html);
  let freezes: boolean | null = null;

  if (!recipe || recipe.ingredients.length < 2 || recipe.instructions.length < 1) {
    const text = htmlToText(page.html);
    if (text.length < 200) {
      throw new HttpError(422, "That page has almost no text (it may need a login or JavaScript) — try a photo instead");
    }
    const title = metaContent(page.html, "og:title") ?? page.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
    const ai = await extractFromPageText(text, page.url, title);
    method = "ai";
    freezes = ai.freezes_well;
    recipe = { ...ai, image_url: recipe?.image_url ?? metaContent(page.html, "og:image") };
  }
  if (!recipe.image_url) recipe.image_url = metaContent(page.html, "og:image");
  if (recipe.image_url && !/^https?:\/\//.test(recipe.image_url)) {
    try {
      recipe.image_url = new URL(recipe.image_url, page.url).toString();
    } catch {
      recipe.image_url = null;
    }
  }

  // Same page saved before? Let the client offer "open existing" instead of a duplicate.
  const { data: existing, error } = await supabase
    .from("recipes")
    .select("id,title")
    .eq("household_id", householdId)
    .in("source_url", [...new Set([sourceUrl, canonical(url)])])
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error);

  return ok({
    method,
    ...toDraft({ ...recipe, freezes_well: freezes }, { source_type: "url", source_url: sourceUrl }),
    existing: existing ?? null,
  });
});
