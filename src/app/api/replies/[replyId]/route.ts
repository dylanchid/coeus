import { handleDeleteReply, handleUpdateReply } from "@/lib/conversationApi";
import { SupabaseConversationStore } from "@/lib/conversationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

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
  return instrument(
    { route: "replies.byId", operation: "handleUpdateReply", correlationId: requestCorrelationId(request) },
    () => handleUpdateReply(replyId, request, dependencies()),
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ replyId: string }> },
): Promise<Response> {
  const { replyId } = await context.params;
  return instrument(
    { route: "replies.byId", operation: "handleDeleteReply", correlationId: requestCorrelationId(request) },
    () => handleDeleteReply(replyId, dependencies()),
  );
}
