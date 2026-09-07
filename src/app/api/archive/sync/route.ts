import { after } from "next/server";
import { handleArchiveSync } from "@/lib/archiveApi";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { logDelivery, newCorrelationId } from "@/lib/deliveryLog";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const supabase = createAdminSupabaseClient();
  const response = await handleArchiveSync(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseArchiveSyncStore(supabase),
  });

  // Push to any connected destinations without delaying the sync response.
  // Vercel Hobby cron only runs the /destinations/worker route once a day,
  // so this is the primary delivery trigger; that route is the catch-up.
  after(async () => {
    const correlationId = newCorrelationId();
    try {
      const encryptionKey = process.env.DESTINATION_TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey) return;
      const ownerId = await authenticateArchiveRequest();
      if (!ownerId) return;
      const store = new SupabaseDestinationsStore(supabase, encryptionKey);
      // The lease's minimum-interval check collapses a burst of syncs into one
      // delivery run per window, so this hook is safe to fire on every sync.
      await runDestinationWorkerTick(new SupabaseArchiveSyncStore(supabase), store, { ownerId, correlationId });
    } catch (error) {
      // Delivery must never fail or delay the sync response; surface it in logs
      // with the correlation id instead of swallowing it silently.
      logDelivery("destination_delivery.after_hook.error", {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return response;
}
