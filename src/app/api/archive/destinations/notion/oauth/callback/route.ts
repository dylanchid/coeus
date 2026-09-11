import { handleNotionOAuthCallback } from "@/lib/notionOAuthApi";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { SupabaseNotionOAuthStateStore } from "@/lib/notionOAuthStateStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/** Deterministic provider boundary for the disposable Playwright environment.
 * This is unreachable in production: the test-session gate itself rejects
 * production deployments, and no real Notion credential is ever used. */
const e2eNotionFetcher: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("/oauth/token")) {
    return Response.json({ access_token: "e2e-notion-token", workspace_name: "E2E Workspace" });
  }
  if (url.endsWith("/search")) return Response.json({ results: [{ id: "e2e-notion-database" }] });
  return new Response(null, { status: 404 });
};

export async function GET(request: Request): Promise<Response> {
  return instrument({ route: "notion_oauth.callback", operation: "handleNotionOAuthCallback", correlationId: requestCorrelationId(request) }, () =>
  handleNotionOAuthCallback(request, {
    stateSecret: requiredEnvironment("DESTINATION_OAUTH_STATE_SECRET"),
    clientId: requiredEnvironment("NOTION_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnvironment("NOTION_OAUTH_CLIENT_SECRET"),
    redirectUri: requiredEnvironment("NOTION_OAUTH_REDIRECT_URI"),
    store: new SupabaseDestinationsStore(createAdminSupabaseClient(), requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY")),
    authenticate: authenticateArchiveRequest,
    ...(process.env.E2E_TEST_LOGIN === "1" ? { fetcher: e2eNotionFetcher } : {}),
    stateStore: new SupabaseNotionOAuthStateStore(createAdminSupabaseClient()),
  }));
}
