import { handleListFollowed } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleListFollowed({
    authenticate: authenticateArchiveRequest,
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  });
}
