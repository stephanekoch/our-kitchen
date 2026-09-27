import { z } from "zod";
import { isAllowed } from "@/lib/allowlist";
import { handle, HttpError, ok, readJson } from "@/lib/http";
import { safeNext, siteUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ email: z.email().max(254), next: z.string().max(500).nullish() });

/** POST /api/auth/login { email, next? } — emails a magic link to family members only. */
export const POST = handle(async (request: Request) => {
  const { email, next } = Body.parse(await readJson(request));
  if (!isAllowed(email)) throw new HttpError(403, "This email isn't on the family list");

  const supabase = await createClient();
  const callback = new URL(`${siteUrl(request)}/auth/callback`);
  callback.searchParams.set("next", safeNext(next));

  const { error } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase(),
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) {
    if (error.status === 429) throw new HttpError(429, "Too many emails — wait a minute and try again");
    console.error("signInWithOtp", error.message);
    throw new HttpError(502, "Couldn't send the sign-in email");
  }
  return ok({ sent: true });
});
