import { handle } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/** POST /api/auth/logout */
export const POST = handle(async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return new Response(null, { status: 204 });
});
