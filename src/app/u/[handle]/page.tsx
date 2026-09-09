import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileView } from "@/components/ProfileView";
import { deriveProfileView, deriveCollectionCards, derivePostCards } from "@/lib/publicProfile";
import { resolveProfileTab } from "@/lib/profileTabs";
import { decodeProfileFeedCursor, PROFILE_FEED_PAGE_SIZE } from "@/lib/profileFeedCursor";
import { loadProfileIdentity } from "@/lib/profilePageLoader.server";
import { SupabaseProfileStore } from "@/lib/profileStore.server";
import { SupabaseProfileFollowStore } from "@/lib/profileFollowStore.server";
import { SupabasePostPublicationStore } from "@/lib/postPublicationStore.server";
import { SupabaseConversationProfileReader } from "@/lib/conversationProfileStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import type { ReplyComposeTarget } from "@/components/ProfileReplies";
import type { Viewer } from "@/lib/visibility";

export const dynamic = "force-dynamic";

/**
 * `loadProfileIdentity` is a request-scoped `cache()` shared with
 * `generateMetadata`, so the two passes cost one `resolveHandle` query between
 * them. The render body then issues one parallel batch for everything the view
 * needs: publications, posts, the person-follow counts, and — for a signed-in
 * non-owner — whether this viewer follows the profile (plan risk R5: resolved
 * once here, carried down as the Viewer).
 */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return { title: "Profile not found — Coeus" };
  const { profile } = resolution;
  // No redirect handling here on purpose: when the page body calls
  // permanentRedirect the response is a 308 with no rendered document, so this
  // metadata is never delivered. Returning the canonical profile's metadata is
  // harmless if a crawler ignores the redirect.
  return {
    title: `${profile.displayName} (@${profile.handle}) — Coeus`,
    description: profile.bio ?? undefined,
    alternates: { canonical: `/@${profile.handle}` },
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
  // A retired handle 308s straight to the canonical one, before any data load
  // or render. permanentRedirect throws, so it must stay outside a try block.
  if (resolution.redirectFrom) permanentRedirect(`/@${profile.handle}`);
  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;

  const admin = createAdminSupabaseClient();
  const profileStore = new SupabaseProfileStore(admin);
  const followStore = new SupabaseProfileFollowStore(admin);
  const postReader = new SupabasePostPublicationStore(admin);
  const conversationReader = new SupabaseConversationProfileReader(admin);

  // The dedicated Collections / Posts tabs page through a keyset cursor beyond
  // the bt0 load cap (bareaga_web-p5o). Overview and every other tab render
  // from the capped full loads below, unchanged. Only one of the two page
  // loads is ever issued, and only when its tab is the active one.
  const activeParam = resolveProfileTab(query.tab);
  const feedCursor = decodeProfileFeedCursor(query.cursor);
  const feedRequest = { cursor: feedCursor, limit: PROFILE_FEED_PAGE_SIZE };

  const [
    publications,
    posts,
    followers,
    following,
    initialFollowing,
    reposts,
    likes,
    replies,
    collectionsPage,
    postsPage,
  ] = await Promise.all([
    profileStore.listOwnedPublications(profile.id),
    postReader.listByAuthor(profile.id),
    followStore.countFollowers(profile.id),
    followStore.countFollowing(profile.id),
    viewerId && !isOwner ? followStore.isFollowing(viewerId, profile.id) : Promise.resolve(false),
    conversationReader.listRepostsByActor(profile.id),
    conversationReader.listLikesByActor(profile.id),
    conversationReader.listRepliesByActor(profile.id),
    activeParam === "collections"
      ? profileStore.pageOwnedPublications(profile.id, feedRequest)
      : Promise.resolve(null),
    activeParam === "posts"
      ? postReader.pageByAuthor(profile.id, feedRequest)
      : Promise.resolve(null),
  ]);

  const viewer: Viewer = isOwner
    ? { kind: "owner", id: viewerId! }
    : initialFollowing
      ? { kind: "follower", id: viewerId! }
      : viewerId
        ? { kind: "signed-in", id: viewerId }
        : { kind: "anonymous" };

  // The `followers`-tier target check in canSeeIndirect needs, for each row,
  // whether THIS viewer follows that row's target owner — a different person
  // from the profile owner. Resolve it once across every distinct target owner.
  // A signed-in owner viewing their own profile short-circuits canSeeIndirect,
  // so only a signed-in non-owner needs the lookup.
  let viewerFollowsTargetOwners = new Set<string>();
  if (viewerId && !isOwner) {
    const targetOwnerIds = [
      ...reposts,
      ...likes,
      ...replies,
    ].flatMap((row) => (row.target ? [row.target.ownerId] : []));
    viewerFollowsTargetOwners = await conversationReader.followsAmong(viewerId, targetOwnerIds);
  }

  // Per-root descendant totals, so a thread that runs past what the tab loads
  // links to the dedicated thread page ("View all N replies"). One query,
  // bounded by REPLY_ROOT_LIMIT roots; skipped when the Replies section will
  // not render for this viewer anyway.
  let replyDescendantCounts = new Map<string, number>();
  if (profile.sections.showReplies || isOwner) {
    const replyRootIds = replies.filter((row) => row.parentId === null).map((row) => row.id);
    if (replyRootIds.length) {
      replyDescendantCounts = await conversationReader.threadDescendantCounts(replyRootIds);
    }
  }

  const view = deriveProfileView(profile, publications, viewer, {
    posts,
    sections: profile.sections,
    followers,
    following,
    reposts,
    likes,
    replies,
    viewerFollowsTargetOwners,
    replyDescendantCounts,
  });

  // Owner-only: the ids each reply thread needs so the composer can post into
  // it. Kept out of PublicProfileView so no target uuid crosses to a visitor.
  const replyComposeTargets: Record<string, ReplyComposeTarget> = {};
  if (isOwner) {
    for (const row of replies) {
      if (row.parentId === null && row.target) {
        replyComposeTargets[row.id] = {
          targetType: row.targetType,
          targetId: row.targetId,
          targetVisibility: row.target.visibility,
        };
      }
    }
  }
  const openEditor = isOwner && (query.edit === "1" || query.edit === "true");

  // Apply the SAME viewer cut deriveProfileView uses, on the cursor page only.
  const paginatedCollections = collectionsPage
    ? {
        cards: deriveCollectionCards(collectionsPage.items, viewer, profile.pinnedCollectionSlugs),
        hasMore: collectionsPage.hasMore,
        nextCursor: collectionsPage.nextCursor,
      }
    : null;
  const paginatedPosts = postsPage
    ? {
        cards: derivePostCards(postsPage.items, viewer),
        hasMore: postsPage.hasMore,
        nextCursor: postsPage.nextCursor,
      }
    : null;

  return (
    <AppShell section="account">
      <ProfileView
        view={view}
        tab={resolveProfileTab(query.tab)}
        follow={isOwner ? null : { profileId: profile.id, initialFollowing }}
        sectionSwitches={isOwner ? profile.sections : null}
        openEditor={openEditor}
        replyComposeTargets={replyComposeTargets}
        paginatedCollections={paginatedCollections}
        paginatedPosts={paginatedPosts}
        onCursor={feedCursor !== null}
      />
    </AppShell>
  );
}
