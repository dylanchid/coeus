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

/**
 * `loadProfileIdentity` is a request-scoped `cache()` shared with
 * `generateMetadata`, so the two passes cost one `resolveHandle` query between
 * them. The render body then issues one parallel batch for everything the view
 * needs: the active tab's cards, aggregate sidebar figures, the person-follow counts, and — for a signed-in
 * non-owner — whether this viewer follows the profile (plan risk R5: resolved
 * once here, carried down as the Viewer).
 */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: PROFILE_NOT_FOUND_TITLE };
  const { profile } = resolution;
  // No redirect handling here on purpose: when the page body calls
  // permanentRedirect the response is a 308 with no rendered document, so this
  // metadata is never delivered. Returning the canonical profile's metadata is
  // harmless if a crawler ignores the redirect.
  return pageMetadata({
    title: profileShareTitle(profile.displayName, profile.handle),
    path: `/@${profile.handle}`,
    description: profileShareDescription(profile.bio, profile.handle),
  });
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
  // A retired handle 308s straight to the canonical one, before any data load
  // or render. permanentRedirect throws, so it must stay outside a try block.
  if (resolution.redirectFrom) permanentRedirect(`/@${profile.handle}`);
  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;

  const admin = createAdminSupabaseClient();
  const profileStore = new SupabaseProfileStore(admin);
  const followStore = new SupabaseProfileFollowStore(admin);

  // Collections use a keyset page only when active. Overview alone loads
  // collection cards for its preview; sidebar figures use the visibility-cut
  // aggregate below rather than a second card payload.
  const activeParam = resolveProfileTab(query.tab);
  const feedCursor = decodeProfileFeedCursor(query.cursor);
  const feedRequest = { cursor: feedCursor, limit: PROFILE_FEED_PAGE_SIZE };

  // Resolve the relationship first: it defines the visibility-safe aggregate
  // predicates below. Cursor tabs load only their own card slice; overview is
  // the sole surface that needs the capped collection card list.
  const initialFollowing = viewerId && !isOwner ? await followStore.isFollowing(viewerId, profile.id) : false;
  const viewer: Viewer = isOwner
    ? { kind: "owner", id: viewerId! }
    : initialFollowing
      ? { kind: "follower", id: viewerId! }
      : viewerId
        ? { kind: "signed-in", id: viewerId }
        : { kind: "anonymous" };
  const [overviewPublications, collectionCount, followers, following, collectionsPage] = await Promise.all([
    activeParam === "overview" ? profileStore.listOwnedPublications(profile.id) : Promise.resolve([]),
    profileStore.countVisibleOwnedPublications(profile.id, viewer),
    followStore.countFollowers(profile.id),
    followStore.countFollowing(profile.id),
    activeParam === "collections"
      ? profileStore.pageOwnedPublications(profile.id, feedRequest)
      : Promise.resolve(null),
  ]);
  const publications = overviewPublications.length ? overviewPublications : (collectionsPage?.items ?? []);

  const view = deriveProfileView(profile, publications, viewer, {
    sections: profile.sections,
    followers,
    following,
    collectionCount,
  });

  const openEditor = isOwner && (query.edit === "1" || query.edit === "true");

  const paginatedCollections = collectionsPage
    ? {
        cards: deriveCollectionCards(collectionsPage.items, viewer, profile.pinnedCollectionSlugs),
        hasMore: collectionsPage.hasMore,
        nextCursor: collectionsPage.nextCursor,
      }
    : null;

  return (
    <AppShell section="account">
      <ProfileView
        view={view}
        tab={resolveProfileTab(query.tab)}
        follow={isOwner || viewerId === null ? null : { profileId: profile.id, initialFollowing }}
        sectionSwitches={isOwner ? profile.sections : null}
        openEditor={openEditor}
        paginatedCollections={paginatedCollections}
        onCursor={feedCursor !== null}
      />
    </AppShell>
  );
}
