import { handleArchiveGet } from "@/lib/archiveApi";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleArchiveGet({
    authenticate: authenticateArchiveRequest,
    store: new SupabaseArchiveSyncStore(createAdminSupabaseClient()),
  });
}
