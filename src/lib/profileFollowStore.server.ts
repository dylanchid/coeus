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

function firstEmbedded(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  return (value as Record<string, unknown>) ?? null;
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
    // !inner drops rows whose follower_id (an auth.users id) has no profiles
    // row — an account that followed before completing onboarding. That row is
    // then absent from the list AND from countFollowers, so the two agree.
    return this.pageFollows(
      "created_at, profile:profiles!profile_follows_follower_id_fkey!inner(id,handle,display_name,avatar_url,bio)",
      "followee_id",
      followeeId,
      page
    );
  }

  async listFollowing(followerId: string, page: FollowPageRequest): Promise<FollowPage> {
    return this.pageFollows(
      "created_at, profile:profiles!profile_follows_followee_id_fkey!inner(id,handle,display_name,avatar_url,bio)",
      "follower_id",
      followerId,
      page
    );
  }

  async countFollowers(followeeId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("profile_follows")
      .select("follower_id, profiles!profile_follows_follower_id_fkey!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("followee_id", followeeId);
    if (error) throw error;
    return count ?? 0;
  }

  async countFollowing(followerId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("profile_follows")
      .select("followee_id, profiles!profile_follows_followee_id_fkey!inner(id)", {
        count: "exact",
        head: true,
      })
      .eq("follower_id", followerId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Shared paginator for listFollowers / listFollowing: created_at desc, a
   * `.lt` cursor, and the one-extra-row hasMore idiom listPublic uses. */
  private async pageFollows(
    select: string,
    scopeColumn: "follower_id" | "followee_id",
    scopeValue: string,
    page: FollowPageRequest
  ): Promise<FollowPage> {
    const limit = Math.min(Math.max(Math.trunc(page.limit), 1), MAX_FOLLOW_PAGE_SIZE);
    let query = this.supabase
      .from("profile_follows")
      .select(select)
      .eq(scopeColumn, scopeValue)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (page.cursor) query = query.lt("created_at", page.cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as {
      created_at: string;
      profile: Record<string, unknown> | Record<string, unknown>[] | null;
    }[];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items = pageRows
      .map((row) => firstEmbedded(row.profile))
      .filter((profile): profile is Record<string, unknown> => Boolean(profile))
      .map(followedProfile);
    const nextCursor = pageRows.length ? pageRows[pageRows.length - 1].created_at : null;
    return { items, hasMore, nextCursor };
  }
}
