import { handleListPosts } from "@/lib/publications/postPublicationApi";
import { SupabasePostPublicationStore } from "@/lib/publications/postPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "posts", operation: "handleListPosts", correlationId: newCorrelationId() },
    () => handleListPosts({
    authenticate: authenticateArchiveRequest,
    store: new SupabasePostPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
