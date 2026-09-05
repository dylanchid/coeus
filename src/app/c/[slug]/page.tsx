import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { SupabaseCollectionPublicationStore } from "@/lib/collectionPublicationStore.server";
import { createAdminSupabaseClient } from "@/lib/supabase.server";
import { ExternalLinkHint } from "@/components/ExternalLinkHint";

export const dynamic = "force-dynamic";

const loadPublication = cache(async (slug: string) => {
  const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
  return store.getBySlug(slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  // A thrown error here (e.g. a Supabase outage) is left to Next's error
  // boundary rather than swallowed into "not found" — only a genuinely
  // missing/unpublished/private slug should read as 404.
  const publication = await loadPublication(slug);
  if (!publication) return { title: "Collection not found — Coeus" };
  return {
    title: `${publication.name} — Coeus`,
    description: publication.description || publication.curatorNote || undefined,
  };
}

export default async function PublicCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const publication = await loadPublication(slug);
  if (!publication) notFound();

  return (
    <AppShell
      section="archive"
      footerNote={<>Published with Coeus. <a href={`/c/${publication.slug}/rss.xml`}>Subscribe via RSS</a></>}
    >
      <div className="public-collection-page">
        <header>
          <p className="archive-eyebrow">{publication.visibility === "public" ? "Public collection" : "Unlisted collection"}</p>
          <h1>{publication.name}</h1>
          {publication.description ? <p>{publication.description}</p> : null}
          {publication.attribution ? <p className="public-collection-attribution">{publication.attribution}</p> : null}
          {publication.curatorNote ? <blockquote>{publication.curatorNote}</blockquote> : null}
          <a href={`/c/${publication.slug}/rss.xml`}>Subscribe via RSS ↗</a>
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
