import { handleConnectDestination, handleListDestinations } from "@/lib/destinationsApi";
import { SupabaseDestinationsStore } from "@/lib/destinationsStore.server";
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
  return instrument(
    { route: "archive.destinations", operation: "handleConnectDestination", correlationId: requestCorrelationId(request) },
    () => handleConnectDestination(request, { authenticate: authenticateArchiveRequest, store: store() }),
  );
}
