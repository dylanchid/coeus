import { handleDiscoverCollections } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return instrument(
    { route: "collections.discover", operation: "handleDiscoverCollections", correlationId: requestCorrelationId(request) },
    () => handleDiscoverCollections(request, {
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  }),
  );
}
