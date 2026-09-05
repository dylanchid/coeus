import { handleNotionOAuthCallback } from "@/lib/notionOAuthApi";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleNotionOAuthCallback(request, {
    stateSecret: requiredEnvironment("DESTINATION_OAUTH_STATE_SECRET"),
    clientId: requiredEnvironment("NOTION_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnvironment("NOTION_OAUTH_CLIENT_SECRET"),
    redirectUri: requiredEnvironment("NOTION_OAUTH_REDIRECT_URI"),
    store: new SupabaseDestinationsStore(createAdminSupabaseClient(), requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY")),
  });
}
