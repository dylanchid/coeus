import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { FollowButton } from "@/components/FollowButton";
import { SupabaseCollectionPublicationStore } from "@/lib/publications/collectionPublicationStore.server";
import Link from "next/link";
import { SupabaseProfileFollowStore } from "@/lib/profiles/profileFollowStore.server";
import { SupabaseProfileStore } from "@/lib/profiles/profileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { canSee, type Viewer } from "@/lib/visibility";
import { ExternalLinkHint } from "@/components/ExternalLinkHint";
import type { CollectionPublication, CollectionPublicationItem } from "@/lib/publications/collectionPublication";
import {
  COLLECTION_NOT_FOUND_TITLE,
  collectionShareText,
  collectionShareTitle,
  pageMetadata,
} from "@/lib/siteMetadata";
import { collectionEyebrowKicker } from "@/lib/publications/publishLadder";

export const dynamic = "force-dynamic";

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const PAGE_STEP = 50;
const PAGE_MIN = 50;
const PAGE_MAX = 500;

const loadPublication = cache(async (slug: string) => {
  const store = new SupabaseCollectionPublicationStore(createAdminSupabaseClient());
  return store.getBySlug(slug);
});

/**
 * Request-scoped curator read for metadata. The page body keeps its own
 * lookup; calling this same function there would collapse the two reads.
 */
const loadCurator = cache(async (ownerId: string) => {
  return new SupabaseProfileStore(createAdminSupabaseClient()).get(ownerId);
});

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

function clampShowCount(raw: string | undefined): number {
  if (!raw) return PAGE_MIN;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return PAGE_MIN;
  const clamped = Math.max(PAGE_MIN, Math.min(PAGE_MAX, Math.floor(parsed)));
  return Math.ceil(clamped / PAGE_STEP) * PAGE_STEP;
}

function canonicalCollectionUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return new URL(`/c/${slug}`, base).href;
}

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
    return { title: COLLECTION_NOT_FOUND_TITLE };
  }
  const curator = await loadCurator(publication.ownerId);
  const linkReachable = publication.visibility === "public" || publication.visibility === "unlisted";
  return pageMetadata({
    title: collectionShareTitle(publication.name, curator?.handle),
    path: `/c/${publication.slug}`,
    description: collectionShareText(publication.curatorNote, publication.description),
    noindex: publication.visibility !== "public",
    ogType: "article",
    types: linkReachable ? { "application/rss+xml": `/c/${publication.slug}/rss.xml` } : undefined,
  });
}

function CollectionActionRow({
  publicationId,
  slug,
  name,
  curatorHandle,
  rssHref,
  canonicalUrl,
  showRss,
}: {
  publicationId: string;
  slug: string;
  name: string;
  curatorHandle?: string;
  rssHref: string;
  canonicalUrl: string;
  showRss: boolean;
}) {
  return (
    <div className="public-collection-actions">
      <FollowButton
        publicationId={publicationId}
        slug={slug}
        name={name}
        curatorHandle={curatorHandle}
      />
      {showRss ? (
        <a className="follow-control follow-control--secondary" href={rssHref}>
          RSS ↗
        </a>
      ) : null}
      <CopyLinkButton url={canonicalUrl} />
    </div>
  );
}

function CollectionIndexEntry({
  item,
  index,
  ruleAfter,
}: {
  item: CollectionPublicationItem;
  index: number;
  ruleAfter: boolean;
}) {
  return (
    <li className={ruleAfter ? "public-collection-index-entry public-collection-index-entry--group-end" : "public-collection-index-entry"}>
      <div className="public-collection-index-entry-main">
        <span className="public-collection-index-number" aria-hidden="true">{index}</span>
        <div className="public-collection-index-copy">
          <h2 className="public-collection-index-title">
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
              <ExternalLinkHint />
            </a>
          </h2>
          {item.curatorComment ? <p className="public-collection-index-comment">{item.curatorComment}</p> : null}
          {item.excerpt ? <p className="public-collection-index-excerpt">{item.excerpt}</p> : null}
        </div>
      </div>
      <h3 className="public-collection-index-source">
        {item.sourceName ? (
          <Link href={`/sources?q=${encodeURIComponent(item.sourceName)}`}>{item.sourceName}</Link>
        ) : item.author ? (
          <span>{item.author}</span>
        ) : (
          <span className="public-collection-index-source-empty">—</span>
        )}
      </h3>
    </li>
  );
}

export default async function PublicCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { slug } = await params;
  const { show: showParam } = await searchParams;
  const publication = await loadPublication(slug);
  if (!publication || !(await canReadPublication(publication))) notFound();

  const curator = await loadCurator(publication.ownerId);
  const rssAvailable = publication.visibility === "public" || publication.visibility === "unlisted";
  const canonicalUrl = canonicalCollectionUrl(publication.slug);
  const rssHref = `/c/${publication.slug}/rss.xml`;
  const totalEntries = publication.items.length;
  const showCount = Math.min(clampShowCount(showParam), totalEntries || PAGE_MIN);
  const visibleItems = publication.items.slice(0, showCount);
  const hasMore = totalEntries > showCount;
  const nextShow = Math.min(showCount + PAGE_STEP, PAGE_MAX, totalEntries);

  return (
    <AppShell
      section="archive"
      footerNote={
        rssAvailable ? (
          <>Published with Coeus. <a href={rssHref}>Subscribe via RSS</a></>
        ) : (
          <>Published with Coeus.</>
        )
      }
    >
      <div className="public-collection-page">
        <header className="public-collection-hero">
          <p className="public-collection-kicker">{collectionEyebrowKicker(publication.visibility)}</p>
          <h1>{publication.name}</h1>
          {curator ? (
            <p className="public-collection-byline">
              by{" "}
              <Link href={`/@${curator.handle}`}>@{curator.handle}</Link>
            </p>
          ) : null}
          {publication.curatorNote ? <p className="public-collection-lede">{publication.curatorNote}</p> : null}
          {publication.description ? <p className="public-collection-description">{publication.description}</p> : null}
          {publication.attribution ? <p className="public-collection-attribution">{publication.attribution}</p> : null}
          <CollectionActionRow
            publicationId={publication.id}
            slug={publication.slug}
            name={publication.name}
            curatorHandle={curator?.handle}
            rssHref={rssHref}
            canonicalUrl={canonicalUrl}
            showRss={rssAvailable}
          />
        </header>
        {totalEntries ? (
          <section className="public-collection-index" aria-label="Collection entries">
            <div className="public-collection-index-head" aria-hidden="true">
              <span>[ENTRY]</span>
              <span>[SOURCE]</span>
            </div>
            <ol className="public-collection-index-list">
              {visibleItems.map((item, offset) => (
                <CollectionIndexEntry
                  key={item.itemLocalId}
                  item={item}
                  index={offset + 1}
                  ruleAfter={(offset + 1) % 10 === 0 && offset + 1 < visibleItems.length}
                />
              ))}
            </ol>
            {hasMore ? (
              <p className="public-collection-more">
                <Link href={`/c/${publication.slug}?show=${nextShow}`}>Show next 50</Link>
              </p>
            ) : null}
            <footer className="public-collection-index-footer">
              {totalEntries} {totalEntries === 1 ? "entry" : "entries"} · updated {formatUpdated(publication.updatedAt)}
            </footer>
            <CollectionActionRow
              publicationId={publication.id}
              slug={publication.slug}
              name={publication.name}
              curatorHandle={curator?.handle}
              rssHref={rssHref}
              canonicalUrl={canonicalUrl}
              showRss={rssAvailable}
            />
          </section>
        ) : (
          <p className="public-collection-empty">This collection doesn&rsquo;t have any entries yet.</p>
        )}
      </div>
    </AppShell>
  );
}