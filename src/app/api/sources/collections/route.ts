import { handleCollectionsBySource } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return instrument(
    { route: "sources.collections", operation: "handleCollectionsBySource", correlationId: requestCorrelationId(request) },
    () => handleCollectionsBySource(request, {
      store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
    }),
  );
}
