import { handleUnfollowProfile } from "@/lib/profileFollowApi";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "profiles.unfollow", operation: "handleUnfollowProfile", correlationId: requestCorrelationId(request) },
    () => handleUnfollowProfile(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileFollowStore(createAdminSupabaseClient()),
  }),
  );
}
