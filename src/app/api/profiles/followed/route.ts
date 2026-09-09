import { handleListFollowedProfiles } from "@/lib/profileFollowApi";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "profiles.followed", operation: "handleListFollowedProfiles", correlationId: newCorrelationId() },
    () => handleListFollowedProfiles({
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileFollowStore(createAdminSupabaseClient()),
  }),
  );
}
