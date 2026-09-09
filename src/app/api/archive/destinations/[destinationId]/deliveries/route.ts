import { handleListDeliveries } from "@/lib/destinationsApi";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ destinationId: string }> }): Promise<Response> {
  const { destinationId } = await context.params;
  return instrument(
    { route: "archive.destinations.deliveries", operation: "handleListDeliveries", correlationId: requestCorrelationId(request) },
    () => handleListDeliveries(destinationId, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseDestinationsStore(createAdminSupabaseClient(), requiredEnvironment("DESTINATION_TOKEN_ENCRYPTION_KEY")),
  }),
  );
}
