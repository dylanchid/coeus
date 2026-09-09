import { handleContentCapture } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return instrument(
    { route: "archive.snapshots", operation: "handleContentCapture", correlationId: requestCorrelationId(request) },
    () => handleContentCapture(request, { authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) }),
  );
}
