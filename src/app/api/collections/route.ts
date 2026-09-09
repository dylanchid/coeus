import { handleListPublications } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "collections", operation: "handleListPublications", correlationId: newCorrelationId() },
    () => handleListPublications({
    authenticate: authenticateArchiveRequest,
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
