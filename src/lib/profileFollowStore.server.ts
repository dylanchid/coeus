import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeProfileFeedCursor, encodeProfileFeedCursor, type ProfileFeedCursor } from "./profileFeedCursor.ts";
import type { FollowedProfile } from "./profileFollow.ts";
import { readAllPages } from "./pagedRead.ts";

/** One page of a follower / following list. `nextCursor` is the composite
 * `(created_at, id)` cursor for the last row on this page. */
export interface FollowPage {
  items: FollowedProfile[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface FollowPageRequest {
  /** Composite `(created_at, id)` keyset cursor, either decoded or the opaque URL token. Null = first page. */
  cursor: ProfileFeedCursor | string | null;
  limit: number;
}

const MAX_FOLLOW_PAGE_SIZE = 50;

function followedProfile(row: Record<string, unknown>): FollowedProfile {
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    bio: typeof row.bio === "string" ? row.bio : null,
  };
}

/**
 * Reads and writes the person-follow graph (profile_follows,
 * 20260906160000_profile_follows.sql). A separate store from
 * {@link ProfileStore} on purpose: ProfileStore has a clean get/save pair
 * worth keeping small, and the follow graph has its own three-method shape.
 *
 * Every method takes the follower id from the authenticated session — never
 * the request body — so a caller can only ever act on their own edges.
 */
export interface ProfileFollowStore {
  /** Idempotent: following someone already followed is a no-op, not an error. */
  follow(followerId: string, followeeId: string): Promise<void>;
  unfollow(followerId: string, followeeId: string): Promise<void>;
  /** The caller's own follows, most-recently-followed first. */
  listFollowed(followerId: string): Promise<FollowedProfile[]>;
  /** Does `followerId` follow `followeeId`? One head-count on the composite PK. */
  isFollowing(followerId: string, followeeId: string): Promise<boolean>;
  /**
   * Who follows `followeeId`, newest first, paginated. Followers whose
   * follower_id (an auth.users id) has no profiles row — an account that
   * followed before onboarding — are omitted, so the page agrees with
   * {@link countFollowers}.
   */
  listFollowers(followeeId: string, page: FollowPageRequest): Promise<FollowPage>;
  /** Who `followerId` follows, newest first, paginated. */
  listFollowing(followerId: string, page: FollowPageRequest): Promise<FollowPage>;
  /** Count of followers with a profile row — matches {@link listFollowers}. */
  countFollowers(followeeId: string): Promise<number>;
  /** Count of followed profiles — matches {@link listFollowing}. */
  countFollowing(followerId: string): Promise<number>;
}

export class SupabaseProfileFollowStore implements ProfileFollowStore {
  // A TS parameter-property constructor breaks test files that import this
  // module under node --experimental-strip-types — see collectionPublicationStore.server.ts.
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async follow(followerId: string, followeeId: string): Promise<void> {
    const { error } = await this.supabase
      .from("profile_follows")
      .upsert(
        { follower_id: followerId, followee_id: followeeId },
        { onConflict: "follower_id,followee_id", ignoreDuplicates: true }
      );
    if (error) throw error;
  }

  async unfollow(followerId: string, followeeId: string): Promise<void> {
    const { error } = await this.supabase
      .from("profile_follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("followee_id", followeeId);
    if (error) throw error;
  }

  async listFollowed(followerId: string): Promise<FollowedProfile[]> {
    const rows = await readAllPages(
      (from, to) => this.supabase
        .from("profile_follows")
        .select("created_at, followee_id, followee:profiles!profile_follows_followee_id_fkey(id,handle,display_name,avatar_url,bio)")
        .eq("follower_id", followerId)
        .order("created_at", { ascending: false })
        .order("followee_id", { ascending: false })
        .range(from, to)
    );

    const followed = (rows ?? []) as unknown as { followee: Record<string, unknown> | Record<string, unknown>[] | null }[];
    return followed
      .map((row) => (Array.isArray(row.followee) ? row.followee[0] : row.followee))
      .filter((followee): followee is Record<string, unknown> => Boolean(followee))
      .map(followedProfile);
  }

  async isFollowing(followerId: string, followeeId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("profile_follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", followerId)
      .eq("followee_id", followeeId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async listFollowers(followeeId: string, page: FollowPageRequest): Promise<FollowPage> {
    // The other side of the edge is follower_id, which references auth.users —
    // NOT profiles — so PostgREST cannot embed the profile row (there is no
    // public FK to follow). Resolve it in a second query, dropping followers
    // with no profiles row (followed before onboarding) so the page and
    // countFollowers still agree.
    return this.pageFollows("followee_id", followeeId, "follower_id", page);
  }

  async listFollowing(followerId: string, page: FollowPageRequest): Promise<FollowPage> {
    return this.pageFollows("follower_id", followerId, "followee_id", page);
  }

  async countFollowers(followeeId: string): Promise<number> {
    return this.countJoinable(followeeId, "followee_id", "follower_id");
  }

  async countFollowing(followerId: string): Promise<number> {
    return this.countJoinable(followerId, "follower_id", "followee_id");
  }

  /**
   * Count profile_follows rows in one direction whose OTHER end has a profiles
   * row. A plain `count` over the join column would include a `follower_id`
   * with no profile (followed before onboarding); this keeps the figure equal
   * to what {@link listFollowers} renders.
   */
  private async countJoinable(
    scopeValue: string,
    scopeColumn: "follower_id" | "followee_id",
    joinColumn: "follower_id" | "followee_id"
  ): Promise<number> {
    const edges = await readAllPages((from, to) => this.supabase
      .from("profile_follows")
      .select(joinColumn)
      .eq(scopeColumn, scopeValue)
      .order(joinColumn)
      .range(from, to));
    const ids = [...new Set((edges as Record<string, string>[]).map((row) => row[joinColumn]))];
    // Keep the profile count query below PostgREST's response and URL limits as
    // well; this graph can be much larger than the displayed page size.
    let count = 0;
    for (let start = 0; start < ids.length; start += 1_000) {
      const { count: pageCount, error } = await this.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", ids.slice(start, start + 1_000));
      if (error) throw error;
      count += pageCount ?? 0;
    }
    return count;
  }

  /** Shared paginator for listFollowers / listFollowing: composite keyset
   * ordering `(created_at, id)` desc, with the cursor encoded as a single opaque
   * token. */
  private async pageFollows(
    scopeColumn: "follower_id" | "followee_id",
    scopeValue: string,
    joinColumn: "follower_id" | "followee_id",
    page: FollowPageRequest
  ): Promise<FollowPage> {
    const limit = Math.min(Math.max(Math.trunc(page.limit), 1), MAX_FOLLOW_PAGE_SIZE);
    const cursor = typeof page.cursor === "string" ? decodeProfileFeedCursor(page.cursor) : page.cursor;
    let query = this.supabase
      .from("profile_follows")
      .select(`created_at, ${joinColumn}`)
      .eq(scopeColumn, scopeValue)
      .order("created_at", { ascending: false })
      .order(joinColumn, { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      const { ts, id } = cursor;
      query = query.or(`created_at.lt.${ts},and(created_at.eq.${ts},${joinColumn}.lt.${id})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const edges = (data ?? []) as unknown as Record<string, string>[];
    const hasMore = edges.length > limit;
    const pageEdges = edges.slice(0, limit);

    const ids = [...new Set(pageEdges.map((edge) => edge[joinColumn]))];
    const profilesById = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const { data: profileRows, error: profileError } = await this.supabase
        .from("profiles")
        .select("id,handle,display_name,avatar_url,bio")
        .in("id", ids);
      if (profileError) throw profileError;
      for (const row of (profileRows ?? []) as Record<string, unknown>[]) {
        profilesById.set(String(row.id), row);
      }
    }

    const items = pageEdges
      .map((edge) => profilesById.get(edge[joinColumn]))
      .filter((profile): profile is Record<string, unknown> => Boolean(profile))
      .map(followedProfile);
    const last = pageEdges[pageEdges.length - 1];
    const nextCursor = hasMore && last ? encodeProfileFeedCursor({ ts: String(last.created_at), id: String(last[joinColumn]) }) : null;
    return { items, hasMore, nextCursor };
  }
}
