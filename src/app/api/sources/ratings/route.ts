import { handleGetSourceRatings, handlePutSourceRating } from "@/lib/feeds/sourceRatingsApi";
import { SupabaseSourceRatingsStore } from "@/lib/feeds/sourceRatingsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

const dependencies = () => ({
  authenticate: authenticateArchiveRequest,
  store: new SupabaseSourceRatingsStore(createAdminSupabaseClient()),
});

export function GET(request: Request): Promise<Response> {
  return instrument(
    { route: "sources.ratings", operation: "GET", correlationId: requestCorrelationId(request) },
    () => handleGetSourceRatings(request, dependencies()),
  );
}

export function PUT(request: Request): Promise<Response> {
  return instrument(
    { route: "sources.ratings", operation: "PUT", correlationId: requestCorrelationId(request) },
    () => handlePutSourceRating(request, dependencies()),
  );
}
