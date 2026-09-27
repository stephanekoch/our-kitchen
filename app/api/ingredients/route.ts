import { knownIngredients } from "@/lib/canonical";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, ok } from "@/lib/http";

/** GET /api/ingredients — every ingredient used in your recipes, for suggestions while typing. */
export const GET = handle(async () => {
  const { supabase } = await requireHousehold();
  try {
    return ok({ ingredients: await knownIngredients(supabase) });
  } catch (e) {
    throw dbError(e as { message: string; code?: string });
  }
});
