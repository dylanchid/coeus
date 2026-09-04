import { createRequestSupabaseClient } from "@/lib/supabase.server";
export const dynamic = "force-dynamic";
export async function POST() {
  const supabase = await createRequestSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return error ? Response.json({ error: "Sign out failed" }, { status: 503 }) : new Response(null, { status: 204 });
}
