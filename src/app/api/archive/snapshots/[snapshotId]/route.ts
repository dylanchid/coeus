import { handleContentDownload } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await context.params;
  return instrument(
    { route: "archive.snapshots.byId", operation: "handleContentDownload", correlationId: requestCorrelationId(request) },
    () => handleContentDownload(snapshotId, { authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) }),
  );
}
