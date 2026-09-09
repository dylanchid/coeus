import "server-only";

import { loadProfileIdentity } from "./profilePageLoader.server.ts";
import {
  SupabaseConversationProfileReader,
  THREAD_PAGE_SIZE,
} from "./conversationProfileStore.server.ts";
import { SupabaseProfileFollowStore } from "./profileFollowStore.server.ts";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "./supabase.server.ts";
import { visibleSections } from "./profileSections.ts";
import { decodeProfileFeedCursor } from "./profileFeedCursor.ts";
import { deriveThreadView, type ThreadView } from "./threadPage.ts";
import type { Profile } from "./profile.ts";
import type { Viewer } from "./visibility.ts";

/**
 * The data load for /@handle/replies/[replyId] — the dedicated thread page that
 * pages through every descendant of one root reply (bareaga_web-kxe).
 *
 * It applies the SAME viewer resolution the profile page does: the root and
 * every descendant clear canSeeIndirect() against their target's current
 * visibility, with the `followers` tier judged by whether the viewer follows
 * the TARGET owner (resolved once here, plan risk R5). A thread whose root is
 * not visible — target since made private, or the reply belongs to a different
 * profile — is a 404, never an empty render.
 */

export interface ThreadPageData {
  profile: Profile;
  isOwner: boolean;
  /** Set when `handle` is a retired handle: the route 308s to the canonical one. */
  redirectFrom: string | null;
  /** Null ⇒ the route calls notFound() (missing / non-root reply, wrong author,
   * hidden Replies section for a non-owner, or a root that fails canSeeIndirect). */
  view: ThreadView | null;
  hasMore: boolean;
  nextCursor: string | null;
  onCursor: boolean;
}

/** Null ⇒ notFound() (missing handle). */
export async function loadThreadPage(
  handle: string,
  replyId: string,
  rawCursor: string | string[] | undefined,
): Promise<ThreadPageData | null> {
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return null;
  const { profile } = resolution;

  const empty = {
    profile,
    isOwner: false,
    view: null as ThreadView | null,
    hasMore: false,
    nextCursor: null as string | null,
    onCursor: false,
  };

  // Retired handle: 308 before any query, and before the section gate, so a
  // redirect never depends on the owner's switches.
  if (resolution.redirectFrom) return { ...empty, redirectFrom: resolution.redirectFrom };

  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;
  const cursor = decodeProfileFeedCursor(rawCursor);

  // A switched-off Replies section is absent from a non-owner's world entirely —
  // same rule as the followers / following routes.
  if (!visibleSections(profile.sections, { isOwner }).replies) {
    return { ...empty, isOwner, redirectFrom: null, onCursor: cursor !== null };
  }

  const admin = createAdminSupabaseClient();
  const reader = new SupabaseConversationProfileReader(admin);
  const followStore = new SupabaseProfileFollowStore(admin);

  const page = await reader.loadThreadPage(replyId, { cursor, limit: THREAD_PAGE_SIZE });
  const base = { ...empty, isOwner, redirectFrom: null, onCursor: cursor !== null };
  // Not a root reply, or a thread that belongs to a different profile's Replies
  // tab — this URL only serves @handle's own threads.
  if (!page || page.rootAuthorHandle !== profile.handle) return base;

  // canSeeIndirect resolves visibility twice, against two different people:
  //   step 1 (the reply row) uses the viewer ↔ ACTOR relationship — the actor
  //   is this profile's owner, whose Replies tab the thread hangs off;
  //   step 2 (the target) uses the viewer ↔ TARGET-owner relationship.
  // A reply can never jump targets (create_reply enforces it), so the whole
  // thread shares one target owner — at most two follow lookups.
  const targetOwnerId = page.root.target?.ownerId ?? null;
  let followsProfileOwner = false;
  let followsTargetOwner = false;
  if (viewerId !== null && !isOwner) {
    followsProfileOwner = await followStore.isFollowing(viewerId, profile.id);
    followsTargetOwner =
      targetOwnerId === null
        ? false
        : targetOwnerId === profile.id
          ? followsProfileOwner
          : await followStore.isFollowing(viewerId, targetOwnerId);
  }
  const follows = new Set<string>(followsTargetOwner && targetOwnerId ? [targetOwnerId] : []);

  const viewer: Viewer = isOwner
    ? { kind: "owner", id: viewerId! }
    : followsProfileOwner
      ? { kind: "follower", id: viewerId! }
      : viewerId
        ? { kind: "signed-in", id: viewerId }
        : { kind: "anonymous" };

  const view = deriveThreadView(
    page.root,
    page.rootAuthorHandle,
    page.descendants,
    viewer,
    (ownerId) => follows.has(ownerId),
  );

  return {
    ...base,
    view,
    hasMore: view ? page.hasMore : false,
    nextCursor: view ? page.nextCursor : null,
  };
}
