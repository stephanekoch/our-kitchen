import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok } from "@/lib/http";
import { uuid } from "@/lib/recipe-schema";

const DAY = 24 * 60 * 60 * 1000;
const londonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

/** POST /api/recipes/:id/cooked — log a finished cook; returns the numbers for the celebration. */
export const POST = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { supabase, householdId } = await requireHousehold();
  const { id } = await params;
  if (!uuid.safeParse(id).success) throw new HttpError(404, "Recipe not found");

  const { error } = await supabase.from("cook_log").insert({ household_id: householdId, recipe_id: id });
  if (error) {
    if (error.code === "23503") throw new HttpError(404, "Recipe not found");
    throw dbError(error);
  }

  const since = new Date(Date.now() - 120 * DAY).toISOString();
  const [{ count: times, error: e1 }, { data: recent, error: e2 }] = await Promise.all([
    supabase.from("cook_log").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("recipe_id", id),
    supabase.from("cook_log").select("cooked_at").eq("household_id", householdId).gte("cooked_at", since),
  ]);
  if (e1 || e2) throw dbError((e1 ?? e2)!);

  const days = new Set((recent ?? []).map((r) => londonDay(new Date(r.cooked_at as string))));
  let streak = 0;
  for (let d = new Date(); days.has(londonDay(d)); d = new Date(d.getTime() - DAY)) streak++;
  const week = (recent ?? []).filter((r) => Date.now() - new Date(r.cooked_at as string).getTime() < 7 * DAY).length;

  return ok({ times: times ?? 1, week, streak });
});
