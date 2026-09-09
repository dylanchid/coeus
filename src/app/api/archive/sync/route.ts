import { after } from "next/server";
import { handleArchiveSync } from "@/lib/archiveApi";
import { SupabaseArchiveSyncStore } from "@/lib/archiveSyncStore.server";
import { logDelivery } from "@/lib/deliveryLog";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const supabase = createAdminSupabaseClient();
  const correlationId = requestCorrelationId(request);

  // Authenticate once, here, before after() is scheduled. The post-response
  // hook must never call cookies()/getClaims() again: a token refresh inside
  // after() emits Set-Cookie after the response is already flushed, so the
  // rotated Supabase refresh token is dropped and the client's session breaks
  // on its next call (F-27). Capture ownerId and hand the hook a closure.
  const ownerId = await authenticateArchiveRequest();

  const response = await instrument(
    { route: "archive.sync", operation: "handleArchiveSync", correlationId },
    () => handleArchiveSync(request, {
      authenticate: async () => ownerId,
      store: new SupabaseArchiveSyncStore(supabase),
    })
  );

  // Push to any connected destinations without delaying the sync response.
  // Vercel Hobby cron only runs the /destinations/worker route once a day,
  // so this is the primary delivery trigger; that route is the catch-up.
  after(async () => {
    try {
      const encryptionKey = process.env.DESTINATION_TOKEN_ENCRYPTION_KEY;
      if (!encryptionKey || !ownerId) return;
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
