import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { deriveProfileView, deriveCollectionCards } from "@/lib/profiles/publicProfile";
import { resolveProfileTab } from "@/lib/profiles/profileTabs";
import { decodeProfileFeedCursor, PROFILE_FEED_PAGE_SIZE } from "@/lib/profiles/profileFeedCursor";
import { loadProfileIdentity } from "@/lib/profiles/profilePageLoader.server";
import { SupabaseProfileStore } from "@/lib/profiles/profileStore.server";
import { SupabaseProfileFollowStore } from "@/lib/profiles/profileFollowStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import type { Viewer } from "@/lib/visibility";
import {
  PROFILE_NOT_FOUND_TITLE,
  pageMetadata,
  profileShareDescription,
  profileShareTitle,
} from "@/lib/siteMetadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: PROFILE_NOT_FOUND_TITLE };
  const { profile } = resolution;
  const meta = pageMetadata({
    title: profileShareTitle(profile.displayName, profile.handle),
    path: `/@${profile.handle}`,
    description: profileShareDescription(profile.bio, profile.handle),
    types: { "application/rss+xml": `/@${profile.handle}/rss.xml` },
  });
  const ogImage = {
    url: `/@${profile.handle}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: `${profile.displayName} (@${profile.handle}) on Coeus`,
    type: "image/png",
  };
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images: [ogImage] },
    twitter: { ...meta.twitter, card: "summary_large_image" as const, images: [ogImage] },
  };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const query = await searchParams;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) notFound();

  const { profile } = resolution;
  if (resolution.redirectFrom) permanentRedirect(`/@${profile.handle}`);
  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;

  const admin = createAdminSupabaseClient();
  const profileStore = new SupabaseProfileStore(admin);
  const followStore = new SupabaseProfileFollowStore(admin);

  const activeTab = resolveProfileTab(query.tab);
  const feedCursor = decodeProfileFeedCursor(query.cursor);
  const feedRequest = { cursor: feedCursor, limit: PROFILE_FEED_PAGE_SIZE };

  const initialFollowing = viewerId && !isOwner ? await followStore.isFollowing(viewerId, profile.id) : false;
  const viewer: Viewer = isOwner
    ? { kind: "owner", id: viewerId! }
    : initialFollowing
      ? { kind: "follower", id: viewerId! }
      : viewerId
        ? { kind: "signed-in", id: viewerId }
        : { kind: "anonymous" };

  const [collectionsPage, collectionCount, followers, following] = await Promise.all([
    profileStore.pageOwnedPublications(profile.id, feedRequest),
    profileStore.countVisibleOwnedPublications(profile.id, viewer),
    followStore.countFollowers(profile.id),
    followStore.countFollowing(profile.id),
  ]);

  const view = deriveProfileView(profile, collectionsPage.items, viewer, {
    sections: profile.sections,
    followers,
    following,
    collectionCount,
  });

  const openEditor = isOwner && (query.edit === "1" || query.edit === "true");

  const paginatedCollections = {
    cards: deriveCollectionCards(collectionsPage.items, viewer, profile.pinnedCollectionSlugs),
    hasMore: collectionsPage.hasMore,
    nextCursor: collectionsPage.nextCursor,
  };

  return (
    <AppShell section="account">
      <ProfileView
        view={view}
        tab={activeTab}
        follow={isOwner || viewerId === null ? null : { profileId: profile.id, initialFollowing }}
        sectionSwitches={isOwner ? profile.sections : null}
        openEditor={openEditor}
        paginatedCollections={paginatedCollections}
        onCursor={feedCursor !== null}
      />
    </AppShell>
  );
}