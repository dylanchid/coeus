import { handleDiscoverCollections } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleDiscoverCollections(request, {
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  });
}
