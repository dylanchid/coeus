import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { canSee, type Viewer } from "@/lib/visibility";
import { ExternalLinkHint } from "@/components/ExternalLinkHint";
import type { CollectionPublication } from "@/lib/collectionPublication";

export const dynamic = "force-dynamic";

const loadPublication = cache(async (slug: string) => {
  const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
  return store.getBySlug(slug);
});

/**
 * Resolve whether this request may read a collection at any tier. public and
 * unlisted are visible to everyone with the link (zero auth); private and
 * followers cost one JWT check plus, for a signed-in non-owner, one
 * profile_follows lookup — the same Viewer resolution the profile page does.
 */
async function canReadPublication(publication: CollectionPublication): Promise<boolean> {
  if (publication.visibility === "public" || publication.visibility === "unlisted") return true;
  const viewerId = await authenticateArchiveRequest();
  let viewer: Viewer = viewerId ? { kind: "signed-in", id: viewerId } : { kind: "anonymous" };
  if (viewerId === publication.ownerId) {
    viewer = { kind: "owner", id: viewerId };
  } else if (viewerId) {
    const follows = await new SupabaseProfileFollowStore(createAdminSupabaseClient()).isFollowing(
      viewerId,
      publication.ownerId
    );
    if (follows) viewer = { kind: "follower", id: viewerId };
  }
  return canSee(publication.visibility, viewer);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // A thrown error here (e.g. a Supabase outage) is left to Next's error
  // boundary rather than swallowed into "not found" — only a genuinely
  // missing/unpublished/private slug should read as 404.
  const publication = await loadPublication(slug);
  if (!publication || !(await canReadPublication(publication))) {
    return { title: "Collection not found — Coeus" };
  }
  return {
    title: `${publication.name} — Coeus`,
    description: publication.description || publication.curatorNote || undefined,
    alternates: { canonical: `/c/${publication.slug}` },
    robots: { index: publication.visibility === "public", follow: true },
  };
}

export default async function PublicCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publication = await loadPublication(slug);
  if (!publication || !(await canReadPublication(publication))) notFound();

  const eyebrow = {
    public: "Public collection",
    unlisted: "Unlisted collection",
    followers: "Followers-only collection",
    private: "Private collection",
  }[publication.visibility];
  // RSS is link-reachable only, so it is offered for public/unlisted alone.
  const rssAvailable = publication.visibility === "public" || publication.visibility === "unlisted";

  return (
    <AppShell
      section="archive"
      footerNote={
        rssAvailable ? (
          <>Published with Coeus. <a href={`/c/${publication.slug}/rss.xml`}>Subscribe via RSS</a></>
        ) : (
          <>Published with Coeus.</>
        )
      }
    >
      <div className="public-collection-page">
        <header>
          <p className="archive-eyebrow">{eyebrow}</p>
          <h1>{publication.name}</h1>
          {publication.description ? <p>{publication.description}</p> : null}
          {publication.attribution ? <p className="public-collection-attribution">{publication.attribution}</p> : null}
          {publication.curatorNote ? <blockquote>{publication.curatorNote}</blockquote> : null}
          {rssAvailable ? <a href={`/c/${publication.slug}/rss.xml`}>Subscribe via RSS ↗</a> : null}
          <FollowButton publicationId={publication.id} />
        </header>
        {publication.items.length ? (
          <ol className="public-collection-list">
            {publication.items.map((item) => (
              <li key={item.itemLocalId}>
                <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLinkHint /></a></h2>
                {item.sourceName || item.author ? (
                  <p className="public-collection-meta">
                    {item.sourceName}
                    {item.sourceName && item.author ? " — " : ""}
                    {item.author}
                  </p>
                ) : null}
                {item.excerpt ? <p>{item.excerpt}</p> : null}
                {item.curatorComment ? <blockquote>{item.curatorComment}</blockquote> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="public-collection-empty">This collection doesn&rsquo;t have any pieces yet.</p>
        )}
      </div>
    </AppShell>
  );
}
