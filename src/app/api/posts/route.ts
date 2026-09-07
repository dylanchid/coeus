import { handleListPosts } from "@/lib/postPublicationApi";
import { SupabasePostPublicationStore } from "@/lib/postPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleListPosts({
    authenticate: authenticateArchiveRequest,
    store: new SupabasePostPublicationStore(createAdminSupabaseClient()),
  });
}
