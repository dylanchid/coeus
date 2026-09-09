import { handleArchiveRestore, handleArchiveRevisions } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId, requestCorrelationId } from "@/lib/serverLog";
export const dynamic = "force-dynamic";
const dependencies = () => ({ authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) });
export async function GET() {
  return instrument(
    { route: "archive.revisions", operation: "handleArchiveRevisions", correlationId: newCorrelationId() },
    () => handleArchiveRevisions(dependencies()),
  );
}
export async function POST(request: Request) {
  return instrument(
    { route: "archive.revisions", operation: "handleArchiveRestore", correlationId: requestCorrelationId(request) },
    () => handleArchiveRestore(request, dependencies()),
  );
}
