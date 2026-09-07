import "server-only";

import { loadProfileIdentity } from "./profilePageLoader.server.ts";
import { SupabaseProfileFollowStore, type FollowPage } from "./profileFollowStore.server.ts";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "./supabase.server.ts";
import { visibleSections } from "./profileSections.ts";
import type { Profile } from "./profile.ts";

/**
 * The shared data load for /@handle/followers and /@handle/following. Both
 * routes gate on the matching show_* switch: for a non-owner a switched-off
 * list 404s (an empty list and a hidden list must not be distinguishable);
 * the owner sees it with a "hidden from your profile" marker.
 *
 * The list and the count both come from the store's !inner join, so a follower
 * who never onboarded is absent from both and they always agree.
 */

export const FOLLOW_LIST_PAGE_SIZE = 30;

export type FollowDirection = "followers" | "following";

export interface FollowListData {
  profile: Profile;
  isOwner: boolean;
  /** Owner only: the section is switched off, so it renders marked hidden. */
  hiddenFromProfile: boolean;
  count: number;
  page: FollowPage;
}

/** Null → the route should call notFound() (missing handle, or a hidden list
 * for a non-owner). */
export async function loadFollowList(
  handle: string,
  direction: FollowDirection,
  cursor: string | null
): Promise<FollowListData | null> {
  const resolution = await loadProfileIdentity(handle);
  if (!resolution) return null;
  const { profile } = resolution;

  const viewerId = await authenticateArchiveRequest();
  const isOwner = viewerId !== null && viewerId === profile.id;

  const section = visibleSections(profile.sections, { isOwner })[direction];
  // Non-owner + switched off → the section is absent from their world entirely.
  if (!section) return null;

  const store = new SupabaseProfileFollowStore(createAdminSupabaseClient());
  const request = { cursor, limit: FOLLOW_LIST_PAGE_SIZE };
  const [page, count] = await Promise.all([
    direction === "followers"
      ? store.listFollowers(profile.id, request)
      : store.listFollowing(profile.id, request),
    direction === "followers" ? store.countFollowers(profile.id) : store.countFollowing(profile.id),
  ]);

  return { profile, isOwner, hiddenFromProfile: section.hidden, count, page };
}
