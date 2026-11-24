import { permanentRedirect } from "next/navigation";
import { deriveCollectionCards } from "@/lib/profiles/publicProfile";
import { loadProfileIdentity } from "@/lib/profiles/profilePageLoader.server";
import { renderProfileRss } from "@/lib/profiles/profileRss";
import { SupabaseProfileStore } from "@/lib/profiles/profileStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

const RSS_ITEM_CAP = 50;

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }): Promise<Response> {
  const { handle } = await context.params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) {
    return new Response("Not found", { status: 404 });
  }

  const { profile } = resolution;
  if (resolution.redirectFrom) {
    permanentRedirect(`/@${profile.handle}/rss.xml`);
  }

  const rows = await new SupabaseProfileStore(createAdminSupabaseClient()).listOwnedPublications(profile.id);
  const cards = deriveCollectionCards(rows, { kind: "anonymous" }, [])
    .filter((card) => card.visibility === "public" && !card.isUnpublished)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.slug.localeCompare(a.slug))
    .slice(0, RSS_ITEM_CAP);

  const origin = new URL(request.url).origin;
  const profileUrl = `${origin}/@${profile.handle}`;
  const feedUrl = `${origin}/@${profile.handle}/rss.xml`;
  const xml = renderProfileRss(
    { handle: profile.handle, displayName: profile.displayName, bio: profile.bio },
    cards.map((card) => ({
      slug: card.slug,
      name: card.name,
      description: card.description,
      curatorNote: card.curatorNote,
      publishedAt: card.publishedAt,
    })),
    { feedUrl, profileUrl, origin },
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}