import { z } from "zod";
import { isAllowed } from "@/lib/allowlist";
import { requireHousehold } from "@/lib/context";
import { dbError, handle, HttpError, ok, readJson } from "@/lib/http";

const Body = z.object({ email: z.email().max(254) });

/**
 * POST /api/household/invites { email }
 * The invited person joins this household when they next sign in.
 */
export const POST = handle(async (request: Request) => {
  const { supabase, householdId, email: you } = await requireHousehold();
  const email = Body.parse(await readJson(request)).email.toLowerCase();
  if (email === you?.toLowerCase()) throw new HttpError(400, "That's you");
  if (!isAllowed(email)) {
    throw new HttpError(400, "Add this email to ALLOWED_EMAILS in Vercel first, or they won't be able to sign in");
  }

  const { data, error } = await supabase
    .from("household_invites")
    .insert({ email, household_id: householdId })
    .select("email,created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "That email already has an invite");
    throw dbError(error);
  }
  return ok({ invite: data }, 201);
});

/** DELETE /api/household/invites?email=… */
export const DELETE = handle(async (request: Request) => {
  const { supabase, householdId } = await requireHousehold();
  const email = z.email().parse(new URL(request.url).searchParams.get("email") ?? "").toLowerCase();
  const { data, error } = await supabase
    .from("household_invites")
    .delete()
    .eq("email", email)
    .eq("household_id", householdId)
    .select("email");
  if (error) throw dbError(error);
  if (!data.length) throw new HttpError(404, "No invite for that email");
  return new Response(null, { status: 204 });
});
