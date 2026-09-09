import { handleFollowProfile } from "@/lib/profileFollowApi";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "profiles.follow", operation: "handleFollowProfile", correlationId: requestCorrelationId(request) },
    () => handleFollowProfile(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileFollowStore(createAdminSupabaseClient()),
  }),
  );
}
