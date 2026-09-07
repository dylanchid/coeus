import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowedProfile } from "./profileFollow.ts";

/** One page of a follower / following list. `nextCursor` is the created_at of
 * the last row on this page — feed it back as `cursor` for the next page. */
export interface FollowPage {
  items: FollowedProfile[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface FollowPageRequest {
  /** ISO created_at; rows strictly older than this are returned. Null = first page. */
  cursor: string | null;
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
    // The followee_id FK to profiles lets PostgREST embed the profile row in
    // one request; created_at desc gives most-recently-followed-first.
    const { data, error } = await this.supabase
      .from("profile_follows")
      .select("created_at, followee:profiles!profile_follows_followee_id_fkey(id,handle,display_name,avatar_url,bio)")
      .eq("follower_id", followerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // PostgREST types an embedded to-one relationship as an array; at runtime a
    // followee_id FK yields either one object or null.
    const rows = (data ?? []) as unknown as { followee: Record<string, unknown> | Record<string, unknown>[] | null }[];
    return rows
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
    const { data, error } = await this.supabase
      .from("profile_follows")
      .select(joinColumn)
      .eq(scopeColumn, scopeValue);
    if (error) throw error;
    const ids = [...new Set(((data ?? []) as Record<string, string>[]).map((row) => row[joinColumn]))];
    if (!ids.length) return 0;
    const { count, error: profileError } = await this.supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("id", ids);
    if (profileError) throw profileError;
    return count ?? 0;
  }

  /** Shared paginator for listFollowers / listFollowing: created_at desc, a
   * `.lt` cursor, the one-extra-row hasMore idiom, then a second query to
   * resolve the `joinColumn` end to profile rows (dropping any without one). */
  private async pageFollows(
    scopeColumn: "follower_id" | "followee_id",
    scopeValue: string,
    joinColumn: "follower_id" | "followee_id",
    page: FollowPageRequest
  ): Promise<FollowPage> {
    const limit = Math.min(Math.max(Math.trunc(page.limit), 1), MAX_FOLLOW_PAGE_SIZE);
    let query = this.supabase
      .from("profile_follows")
      .select(`created_at, ${joinColumn}`)
      .eq(scopeColumn, scopeValue)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (page.cursor) query = query.lt("created_at", page.cursor);

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
    const nextCursor = pageEdges.length ? String(pageEdges[pageEdges.length - 1].created_at) : null;
    return { items, hasMore, nextCursor };
  }
}
