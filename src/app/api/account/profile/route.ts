import { handleGetProfile, handleSaveProfile } from "@/lib/profileApi";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

function dependencies() {
  return { authenticate: authenticateArchiveRequest, store: new SupabaseProfileStore(createAdminSupabaseClient()) };
}

export async function GET(): Promise<Response> {
  return handleGetProfile(dependencies());
}

export async function PUT(request: Request): Promise<Response> {
  return handleSaveProfile(request, dependencies());
}
