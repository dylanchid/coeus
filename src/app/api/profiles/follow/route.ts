import { handleFollowProfile } from "@/lib/profileFollowApi";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleFollowProfile(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileFollowStore(createAdminSupabaseClient()),
  });
}
