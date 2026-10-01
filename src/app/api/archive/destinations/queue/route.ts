import { QueueClient } from "@vercel/queue";
import { SupabaseArchiveSyncStore } from "@/lib/archive/archiveSyncStore.server";
import { destinationQueueEnabled, isDestinationDeliveryRequest, processDestinationDeliveryRequest } from "@/lib/destinationQueue.server";
import { logDelivery } from "@/lib/deliveryLog";
import { runDestinationWorkerTick } from "@/lib/destinationWorker.server";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const queue = new QueueClient({ region: process.env.VERCEL_REGION ?? "iad1" });

/** Private Vercel Queue callback; vercel.json registers the only caller. */
export const POST = queue.handleCallback(async (payload, metadata) => {
  if (!isDestinationDeliveryRequest(payload)) throw new Error("Invalid destination delivery queue payload");
  logDelivery("destination_delivery.queue.received", {
    correlationId: payload.correlationId,
    ownerId: payload.ownerId,
    requestId: payload.requestId,
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    createdAt: metadata.createdAt.toISOString(),
    expiresAt: metadata.expiresAt.toISOString(),
    topicName: metadata.topicName,
    consumerGroup: metadata.consumerGroup,
    region: metadata.region,
  });
  await processDestinationDeliveryRequest(payload, {
    runTick: async (ownerId, correlationId) => {
      const supabase = createAdminSupabaseClient();
      const store = new SupabaseDestinationsStore(supabase, requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
      return runDestinationWorkerTick(new SupabaseArchiveSyncStore(supabase), store, {
        ownerId,
        correlationId,
        // The queue is already the drain scheduler. The lease still prevents
        // overlap, while the normal interval would stop a 100-item chain.
        minIntervalSeconds: 0,
      });
    },
    // A deployed but disabled consumer acknowledges messages without touching
    // secrets; enabling the flag is the explicit staging/production cutover.
    enabled: destinationQueueEnabled(),
  });
}, {
  visibilityTimeoutSeconds: 300,
  retry: (error, metadata) => {
    logDelivery("destination_delivery.queue.retry", {
      correlationId: metadata.messageId,
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      error: error instanceof Error ? error.message : String(error),
    });
  },
});
