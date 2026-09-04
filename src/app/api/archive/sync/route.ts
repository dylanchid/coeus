import { handleArchiveSync } from "@/lib/archiveApi";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleArchiveSync(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseArchiveSyncStore(createAdminSupabaseClient()),
  });
}
