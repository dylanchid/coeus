import { safeInternalPath } from "@/lib/safeRedirect";
import { createRequestSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/**
 * OAuth landing route. Supabase (after the GitHub/Google round trip) redirects
 * the browser here with `?code=`; we exchange it for a session — which sets the
 * `sb-*` cookies the rest of the app reads — then forward the user on.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"), "/welcome");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (providerError) {
    return Response.redirect(new URL(`/signin?error=${encodeURIComponent(providerError)}`, url), 302);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return Response.redirect(new URL("/signin?error=missing_code", url), 302);
  }

  const supabase = await createRequestSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return Response.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, url), 302);
  }

  return Response.redirect(new URL(next, url), 302);
}
