import { handleListFollowed } from "@/lib/publications/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, newCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return instrument(
    { route: "collections.followed", operation: "handleListFollowed", correlationId: newCorrelationId() },
    async () => {
      const supabase = createAdminSupabaseClient();
      return handleListFollowed({
        authenticate: authenticateArchiveRequest,
        store: new SupabaseCollectionPublicationStore(supabase),
        resolveCuratorHandles: async (ownerIds) => {
          if (!ownerIds.length) return new Map();
          const { data, error } = await supabase.from("profiles").select("id,handle").in("id", [...ownerIds]);
          if (error) throw error;
          return new Map(
            ((data ?? []) as { id: string; handle: string }[]).map((profile) => [String(profile.id), String(profile.handle)]),
          );
        },
      });
    },
  );
}
