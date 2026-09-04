import { handleContentDownload } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ snapshotId: string }> }) {
  const { snapshotId } = await context.params;
  return handleContentDownload(snapshotId, { authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) });
}
