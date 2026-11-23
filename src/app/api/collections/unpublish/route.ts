import { revalidatePath } from "next/cache";
import { parseUnpublishRequest } from "@/lib/publications/collectionPublication";
import { handleUnpublishCollection } from "@/lib/publications/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "collections.unpublish", operation: "handleUnpublishCollection", correlationId: requestCorrelationId(request) },
    async () => {
      const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
      let slug: string | undefined;
      try {
        const body = await request.clone().json() as unknown;
        const parsed = parseUnpublishRequest(body);
        if (parsed.ok) {
          const userId = await authenticateArchiveRequest();
          if (userId) {
            const existing = (await store.list(userId)).find(
              (entry) => entry.collectionLocalId === parsed.value.collectionLocalId,
            );
            slug = existing?.slug;
          }
        }
      } catch {
        // Let the handler return the real error.
      }
      const response = await handleUnpublishCollection(request, {
        authenticate: authenticateArchiveRequest,
        store,
      });
      if (slug && response.status === 204) {
        revalidatePath(`/c/${slug}`);
        revalidatePath(`/c/${slug}/opengraph-image`);
      }
      return response;
    },
  );
}