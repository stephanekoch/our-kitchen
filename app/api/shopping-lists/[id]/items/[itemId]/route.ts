import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";
import { nameKey } from "@/lib/ingredients";
import { uuid } from "@/lib/recipe-schema";
import { assertList } from "@/lib/shopping-db";
import { formatQuantity } from "@/lib/shopping";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function ids(params: Params["params"]) {
  const { id, itemId } = await params;
  if (!uuid.safeParse(id).success || !uuid.safeParse(itemId).success) throw new HttpError(404, "Item not found");
  return { id, itemId };
}

const Patch = z
  .object({
    checked: z.boolean(),
    name: z.string().trim().min(1).max(200),
    quantity: z.number().positive().max(100000).nullable(),
    unit: z.string().trim().max(20).nullable(),
    category: z.enum(CATEGORIES),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");

/** PATCH /api/shopping-lists/:id/items/:itemId { checked?, name?, quantity?, unit?, category? } */
export const PATCH = handle(async (request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const { id, itemId } = await ids(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const body = Patch.parse(await readJson(request));

  const update: Record<string, unknown> = { ...body };
  if (body.name !== undefined) update.name_key = nameKey(body.name);
  // Changing the name or amount makes it your own line, so recipe changes won't overwrite it.
  if (body.name !== undefined || body.quantity !== undefined || body.unit !== undefined) update.is_manual = true;
  if (body.checked !== undefined) {
    update.checked_at = body.checked ? new Date().toISOString() : null;
    update.checked_by = body.checked ? ctx.userId : null;
  }

  const { data, error } = await ctx.supabase
    .from("shopping_list_items")
    .update(update)
    .eq("id", itemId)
    .eq("list_id", id)
    .select("*")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "Item not found");
  return ok({ item: { ...data, amount: formatQuantity(data.quantity, data.unit) } });
});

/** DELETE /api/shopping-lists/:id/items/:itemId — your own items are deleted; recipe lines are hidden so they stay off. */
export const DELETE = handle(async (_request: Request, { params }: Params) => {
  const ctx = await requireHousehold();
  const { id, itemId } = await ids(params);
  if (!(await assertList(ctx, id))) throw new HttpError(404, "List not found");
  const { data: item, error } = await ctx.supabase
    .from("shopping_list_items").select("id,is_manual").eq("id", itemId).eq("list_id", id).maybeSingle();
  if (error) throw dbError(error);
  if (!item) throw new HttpError(404, "Item not found");
  const { error: e2 } = item.is_manual
    ? await ctx.supabase.from("shopping_list_items").delete().eq("id", itemId)
    : await ctx.supabase.from("shopping_list_items").update({ cleared: true }).eq("id", itemId);
  if (e2) throw dbError(e2);
  return new Response(null, { status: 204 });
});
