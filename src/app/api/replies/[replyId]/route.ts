import { handleDeleteReply, handleUpdateReply } from "@/lib/conversationApi";
import { SupabaseConversationStore } from "@/lib/conversationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

function dependencies() {
  return {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseConversationStore(createAdminSupabaseClient()),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ replyId: string }> },
): Promise<Response> {
  const { replyId } = await context.params;
  return handleUpdateReply(replyId, request, dependencies());
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ replyId: string }> },
): Promise<Response> {
  const { replyId } = await context.params;
  return handleDeleteReply(replyId, dependencies());
}
