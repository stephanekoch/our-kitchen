import { z } from "zod";
import { isAllowed } from "@/lib/allowlist";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  email: z.email().max(254),
  code: z.string().trim().regex(/^\d{6,10}$/, "Enter the code from the email"),
  next: z.string().max(500).nullish(),
});

/**
 * POST /api/auth/verify { email, code } — signs in with the code from the email.
 * Used instead of tapping the link because an iPhone home-screen app keeps its own cookies:
 * a link opens in Safari and signs Safari in, not the app.
 */
export const POST = handle(async (request: Request) => {
  const { email, code, next } = Body.parse(await readJson(request));
  if (!isAllowed(email)) throw new HttpError(403, "This email isn't on the family list");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.toLowerCase(), token: code, type: "email" });
  if (error) throw new HttpError(400, "That code is wrong or has expired — ask for a new one");

  const { error: rpcError } = await supabase.rpc("ensure_household");
  if (rpcError) {
    console.error("ensure_household", rpcError.message);
    throw new HttpError(500, "Signed in, but setting up your household failed — try again");
  }
  return ok({ next: safeNext(next) });
});
