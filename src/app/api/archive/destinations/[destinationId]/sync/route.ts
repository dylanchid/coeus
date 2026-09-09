import { handleTriggerSync } from "@/lib/destinationsApi";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ destinationId: string }> }): Promise<Response> {
  const { destinationId } = await context.params;
  const supabase = createAdminSupabaseClient();
  const store = new SupabaseDestinationsStore(supabase, requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
  const reader = new SupabaseArchiveSyncStore(supabase);
  return instrument(
    { route: "archive.destinations.sync", operation: "handleTriggerSync", correlationId: requestCorrelationId(request) },
    () =>
      handleTriggerSync(destinationId, {
        authenticate: authenticateArchiveRequest,
        triggerSync: async (ownerId) => {
          // A manual "sync now" is user-initiated, so bypass the rate-limit window
          // (the lease still enforces one run at a time across instances).
          const tick = await runDestinationWorkerTick(reader, store, { ownerId, minIntervalSeconds: 0 });
          return {
            correlationId: tick.correlationId,
            processed: tick.processed,
            skipped: tick.skipped,
            results: tick.results,
          };
        },
      }),
  );
}
