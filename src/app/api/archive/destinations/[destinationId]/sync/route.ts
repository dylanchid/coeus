import { handleTriggerSync } from "@/lib/destinationsApi";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ destinationId: string }> }): Promise<Response> {
  const { destinationId } = await context.params;
  const supabase = createAdminSupabaseClient();
  const store = new SupabaseDestinationsStore(supabase, requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
  const reader = new SupabaseArchiveSyncStore(supabase);
  return handleTriggerSync(destinationId, {
    authenticate: authenticateArchiveRequest,
    triggerSync: async (ownerId) => {
      await runDestinationWorkerTick(reader, store, { ownerId });
    },
  });
}
