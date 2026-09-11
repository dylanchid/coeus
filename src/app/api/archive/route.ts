import { handleArchiveGet } from "@/lib/archive/archiveApi";
import { SupabaseArchiveSyncStore } from "@/lib/archive/archiveSyncStore.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "archive", operation: "handleArchiveGet", correlationId: newCorrelationId() },
    () => handleArchiveGet({
      authenticate: authenticateArchiveRequest,
      store: new SupabaseArchiveSyncStore(createAdminSupabaseClient()),
    })
  );
}
