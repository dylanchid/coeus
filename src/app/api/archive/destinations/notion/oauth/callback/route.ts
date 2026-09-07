import { handleNotionOAuthCallback } from "@/lib/notionOAuthApi";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { SupabaseNotionOAuthStateStore } from "@/lib/notionOAuthStateStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return instrument({ route: "notion_oauth.callback", operation: "handleNotionOAuthCallback", correlationId: requestCorrelationId(request) }, () =>
  handleNotionOAuthCallback(request, {
    stateSecret: requiredEnvironment("DESTINATION_OAUTH_STATE_SECRET"),
    clientId: requiredEnvironment("NOTION_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnvironment("NOTION_OAUTH_CLIENT_SECRET"),
    redirectUri: requiredEnvironment("NOTION_OAUTH_REDIRECT_URI"),
    store: new SupabaseDestinationsStore(createAdminSupabaseClient(), requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY")),
    authenticate: authenticateArchiveRequest,
    stateStore: new SupabaseNotionOAuthStateStore(createAdminSupabaseClient()),
  }));
}
