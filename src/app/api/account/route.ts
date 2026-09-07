import { handleAccountDelete } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request) {
  return instrument(
    { route: "account", operation: "delete", correlationId: requestCorrelationId(request) },
    () => handleAccountDelete(request, { authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) })
  );
}
