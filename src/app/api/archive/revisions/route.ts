import { handleArchiveRestore, handleArchiveRevisions } from "@/lib/archiveRecoveryApi";
import { SupabaseArchiveRecoveryStore } from "@/lib/archiveRecoveryStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
export const dynamic = "force-dynamic";
const dependencies = () => ({ authenticate: authenticateArchiveRequest, store: new SupabaseArchiveRecoveryStore(createAdminSupabaseClient()) });
export async function GET() { return handleArchiveRevisions(dependencies()); }
export async function POST(request: Request) { return handleArchiveRestore(request, dependencies()); }
