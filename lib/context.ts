import { isAllowed } from "./allowlist";
import { HttpError } from "./http";
import { createClient, type Supabase } from "./supabase/server";

export type Ctx = { supabase: Supabase; userId: string; email: string | null; householdId: string };

/** Signed-in user plus their household (joins via invite or creates one on first use). */
export async function requireHousehold(): Promise<Ctx> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sign in first");
  const user = data.user;
  // Supabase lets anyone with the public key create an account; this keeps them out.
  if (!isAllowed(user.email)) throw new HttpError(403, "This account isn't on the family list");

  const { data: member } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let householdId = member?.household_id as string | undefined;
  if (!householdId) {
    const { data: id, error: rpcError } = await supabase.rpc("ensure_household");
    if (rpcError || !id) throw new HttpError(500, "Could not set up your household");
    householdId = id as string;
  }

  return { supabase, userId: user.id, email: user.email ?? null, householdId };
}
