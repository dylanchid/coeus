import { revalidatePath } from "next/cache";
import { handlePublishCollection } from "@/lib/publications/collectionPublicationApi";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "collections.publish", operation: "handlePublishCollection", correlationId: requestCorrelationId(request) },
    async () => {
      const response = await handlePublishCollection(request, {
        authenticate: authenticateArchiveRequest,
        store: new SupabaseCollectionPublicationStore(createAdminSupabaseClient()),
      });
      if (response.status === 201) {
        const publication = (await response.clone().json()) as { slug?: string };
        if (publication.slug) {
          revalidatePath(`/c/${publication.slug}`);
          revalidatePath(`/c/${publication.slug}/opengraph-image`);
        }
      }
      return response;
    },
  );
}