import { handleNotionOAuthStart } from "@/lib/notionOAuthApi";
import { SupabaseNotionOAuthStateStore } from "@/lib/notionOAuthStateStore.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "notion_oauth.start", operation: "handleNotionOAuthStart", correlationId: newCorrelationId() },
    () => handleNotionOAuthStart({
      authenticate: authenticateArchiveRequest,
      stateSecret: requiredEnvironment("DESTINATION_OAUTH_STATE_SECRET"),
      clientId: requiredEnvironment("NOTION_OAUTH_CLIENT_ID"),
      redirectUri: requiredEnvironment("NOTION_OAUTH_REDIRECT_URI"),
      stateStore: new SupabaseNotionOAuthStateStore(createAdminSupabaseClient()),
    }),
  );
}
