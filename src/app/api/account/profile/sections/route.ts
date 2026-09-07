import { handlePatchProfileSections } from "@/lib/profileApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  return handlePatchProfileSections(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileStore(createAdminSupabaseClient()),
  });
}
