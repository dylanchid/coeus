import { handleGetProfile, handleSaveProfile } from "@/lib/profileApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function dependencies() {
  return { authenticate: authenticateArchiveRequest, store: new SupabaseProfileStore(createAdminSupabaseClient()) };
}

export async function GET(): Promise<Response> {
  return instrument(
    { route: "account.profile", operation: "handleGetProfile", correlationId: newCorrelationId() },
    () => handleGetProfile(dependencies()),
  );
}

export async function PUT(request: Request): Promise<Response> {
  return instrument(
    { route: "account.profile", operation: "handleSaveProfile", correlationId: requestCorrelationId(request) },
    () => handleSaveProfile(request, dependencies()),
  );
}
