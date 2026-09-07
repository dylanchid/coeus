import { handleListFollowedProfiles } from "@/lib/profileFollowApi";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleListFollowedProfiles({
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileFollowStore(createAdminSupabaseClient()),
  });
}
