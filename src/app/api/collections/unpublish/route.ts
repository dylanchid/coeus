import { handleUnpublishCollection } from "@/lib/publications/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "collections.unpublish", operation: "handleUnpublishCollection", correlationId: requestCorrelationId(request) },
    () => handleUnpublishCollection(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
