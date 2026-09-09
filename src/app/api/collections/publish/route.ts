import { handlePublishCollection } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "collections.publish", operation: "handlePublishCollection", correlationId: requestCorrelationId(request) },
    () => handlePublishCollection(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
