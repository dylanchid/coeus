import { handlePatchProfileSections } from "@/lib/profileApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  return instrument(
    { route: "account.profile.sections", operation: "handlePatchProfileSections", correlationId: requestCorrelationId(request) },
    () => handlePatchProfileSections(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseProfileStore(createAdminSupabaseClient()),
  }),
  );
}
