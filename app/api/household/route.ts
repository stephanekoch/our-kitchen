import { z } from "zod";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, ok, readJson } from "@/lib/http";

/** GET /api/household — name, members and pending invites. */
export const GET = handle(async () => {
  const { supabase, householdId, userId, email } = await requireHousehold();
  const [household, members, invites] = await Promise.all([
    supabase.from("households").select("id,name,created_at").eq("id", householdId).single(),
    supabase.from("household_members").select("user_id,role,joined_at,email").eq("household_id", householdId).order("joined_at"),
    supabase.from("household_invites").select("email,created_at").eq("household_id", householdId).order("created_at"),
  ]);
  for (const r of [household, members, invites]) if (r.error) throw dbError(r.error);

  return ok({
    household: household.data,
    you: { user_id: userId, email },
    members: (members.data ?? []).map((m) => ({ ...m, is_you: m.user_id === userId })),
    invites: invites.data ?? [],
  });
});

const Patch = z.object({ name: z.string().trim().min(1).max(80) });

/** PATCH /api/household { name } */
export const PATCH = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();
  const { name } = Patch.parse(await readJson(request));
  const { data, error } = await supabase.from("households").update({ name }).eq("id", householdId).select("id,name").single();
  if (error) throw dbError(error);
  return ok({ household: data });
});
