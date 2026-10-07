import { handleConnectDestination, handleListDestinations } from "@/lib/destinations/destinationsApi";
import { enqueueDestinationDelivery, newDestinationDeliveryRequest } from "@/lib/destinations/destinationQueue.server";
import { logDelivery } from "@/lib/deliveryLog";
import { SupabaseDestinationsStore } from "@/lib/destinations/destinationsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";
import { instrument, newCorrelationId, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function store() {
  return new SupabaseDestinationsStore(createAdminSupabaseClient(), requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY"));
}

export async function GET(): Promise<Response> {
  return instrument(
    { route: "archive.destinations", operation: "handleListDestinations", correlationId: newCorrelationId() },
    () => handleListDestinations({ authenticate: authenticateArchiveRequest, store: store() }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = requestCorrelationId(request);
  return instrument(
    { route: "archive.destinations", operation: "handleConnectDestination", correlationId },
    () => handleConnectDestination(request, {
      authenticate: authenticateArchiveRequest,
      store: store(),
      onConnected: async (ownerId) => {
        try {
          await enqueueDestinationDelivery(newDestinationDeliveryRequest(ownerId, correlationId));
        } catch (error) {
          logDelivery("destination_delivery.queue.enqueue.error", {
            correlationId,
            ownerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  );
}
