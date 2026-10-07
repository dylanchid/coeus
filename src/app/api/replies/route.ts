import { handleCreateReply } from "@/lib/conversations/conversationApi";
import { SupabaseConversationStore } from "@/lib/conversations/conversationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "replies", operation: "handleCreateReply", correlationId: requestCorrelationId(request) },
    () => handleCreateReply(request, {
    authenticate: authenticateArchiveRequest,
    store: new SupabaseConversationStore(createAdminSupabaseClient()),
  }),
  );
}
