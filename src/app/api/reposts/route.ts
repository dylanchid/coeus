import { handleRepost, handleUnrepost } from "@/lib/conversationApi";
import { SupabaseConversationStore } from "@/lib/conversationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

function dependencies() {
  return {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseConversationStore(createAdminSupabaseClient()),
  };
}

export async function POST(request: Request): Promise<Response> {
  return handleRepost(request, dependencies());
}

export async function DELETE(request: Request): Promise<Response> {
  return handleUnrepost(request, dependencies());
}
