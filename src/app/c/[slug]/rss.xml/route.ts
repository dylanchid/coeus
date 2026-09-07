import { renderCollectionRss } from "@/lib/collectionPublicationRss";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await context.params;
  const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
  // An unhandled rejection here (e.g. a Supabase outage) falls through to Next's
  // default 500 rather than being reported as a 404 for a slug that does exist.
  const publication = await store.getBySlug(slug);
  // getBySlug now returns rows at any tier; RSS stays link-reachable only —
  // a private/followers feed has no authenticated request to gate on here.
  // (followers-tier RSS with a token is a filed follow-up.)
  if (!publication || (publication.visibility !== "public" && publication.visibility !== "unlisted")) {
    return new Response("Not found", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const xml = renderCollectionRss(publication, {
    feedUrl: `${origin}/c/${publication.slug}/rss.xml`,
    collectionUrl: `${origin}/c/${publication.slug}`,
  });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
