import { z } from "zod";
import { CATEGORIES, categorise } from "@/lib/categories";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { nameKey, parseIngredientLine } from "@/lib/ingredients";
import { uuid } from "@/lib/recipe-schema";
import { assertList } from "@/lib/shopping-db";
import { formatQuantity } from "@/lib/shopping";

type Params = { params: Promise<{ id: string }> };

async function listId(params: Params["params"]) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "List not found");
  return id;
}

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(100000).nullish(),
  unit: z.string().trim().max(20).nullish(),
  category: z.enum(CATEGORIES).nullish(),
});

/** POST /api/shopping-lists/:id/items { name } — "2 lemons" or "nappies" typed straight in. */
export const POST = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = await listId(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const body = Body.parse(await readJson(request));

  // Without an explicit quantity, parse what was typed.
  const parsed = body.quantity == null ? parseIngredientLine(body.name) : null;
  const name = parsed?.name ?? body.name;
  const row = {
    list_id: id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    name_key: nameKey(name),
    quantity: body.quantity ?? parsed?.quantity ?? null,
    unit: body.unit ?? parsed?.unit ?? null,
    category: body.category ?? parsed?.category ?? categorise(name),
    is_manual: true,
  };

  const { data, error } = await ctx.supabase.from("shopping_list_items").insert(row).select("*").single();
  if (error) throw dbError(error);
  return ok({ item: { ...data, amount: formatQuantity(data.quantity, data.unit) } }, 201);
});

/** DELETE /api/shopping-lists/:id/items?checked=true — clear ticked items (?all=true empties the list). */
export const DELETE = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const id = await listId(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const search = new URL(request.url).searchParams;

  let query = ctx.supabase.from("shopping_list_items").delete().eq("list_id", id);
  if (search.get("all") === "true") {
    const { error: e } = await ctx.supabase.from("shopping_list_recipes").delete().eq("list_id", id);
    if (e) throw dbError(e);
  } else if (search.get("checked") === "true") {
    query = query.eq("checked", true);
  } else {
    throw new HttpError(400, "Add ?checked=true to clear ticked items, or ?all=true to empty the list");
  }
  const { data, error } = await query.select("id");
  if (error) throw dbError(error);
  return ok({ removed: data.length });
});
