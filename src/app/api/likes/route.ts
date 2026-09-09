import { handleLike, handleUnlike } from "@/lib/conversationApi";
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

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "likes", operation: "handleLike", correlationId: requestCorrelationId(request) },
    () => handleLike(request, dependencies()),
  );
}

export async function DELETE(request: Request): Promise<Response> {
  return instrument(
    { route: "likes", operation: "handleUnlike", correlationId: requestCorrelationId(request) },
    () => handleUnlike(request, dependencies()),
  );
}
