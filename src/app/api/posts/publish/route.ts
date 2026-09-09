import { handlePublishPost } from "@/lib/postPublicationApi";
import { SupabasePostPublicationStore } from "@/lib/postPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "posts.publish", operation: "handlePublishPost", correlationId: requestCorrelationId(request) },
    () => handlePublishPost(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabasePostPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
