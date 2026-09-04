import { handleUnfollowCollection } from "@/lib/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleUnfollowCollection(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
  });
}
