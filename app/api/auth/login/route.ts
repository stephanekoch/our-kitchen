import { z } from "zod";
import { isAllowed } from "@/lib/allowlist";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(500).nullish(),
});

/**
 * POST /api/auth/login { email, password }
 * Accounts are created by hand in the Supabase dashboard and public sign-ups are off,
 * so no emails are ever sent.
 */
export const POST = handle(async (request: Request) => {
  const { email, password, next } = Body.parse(await readJson(request));
  if (!isAllowed(email)) throw new HttpError(403, "This email isn't on the family list");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase(), password });
  if (error) {
    if (error.status === 429) throw new HttpError(429, "Too many attempts — wait a minute and try again");
    throw new HttpError(401, "Wrong email or password");
  }

  // Joins the household you were invited to, or creates yours on first sign-in.
  const { error: rpcError } = await supabase.rpc("ensure_household");
  if (rpcError) {
    console.error("ensure_household", rpcError.message);
    throw new HttpError(500, "Signed in, but setting up your household failed — try again");
  }
  return ok({ next: safeNext(next) });
});
