import { handleArchiveExport } from "@/lib/archive/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archive/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";
export const dynamic = "force-dynamic";
export async function GET() {
  return instrument(
    { route: "archive.export", operation: "handleArchiveExport", correlationId: newCorrelationId() },
    () => handleArchiveExport({ authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) }),
  );
}
