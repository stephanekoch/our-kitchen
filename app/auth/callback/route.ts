import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/allowlist";
import { safeNext, siteUrl } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic-link landing page. Handles both link styles:
 *  - ?code=…               (Supabase's default PKCE link; must open in the same browser)
 *  - ?token_hash=…&type=…  (custom email template; works in any browser, e.g. the Gmail app)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = siteUrl(request);
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(`${base}/login?error=${reason}`);

  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };
  if (error) return fail("link-expired");

  const { data } = await supabase.auth.getUser();
  let allowed = false;
  try {
    allowed = isAllowed(data.user?.email);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    await supabase.auth.signOut();
    return fail("not-allowed");
  }

  // Joins the household you were invited to, or creates yours on first sign-in.
  const { error: rpcError } = await supabase.rpc("ensure_household");
  if (rpcError) {
    console.error("ensure_household", rpcError.message);
    return fail("setup");
  }

  return NextResponse.redirect(`${base}${next}`);
}
