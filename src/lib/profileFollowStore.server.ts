import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FollowedProfile } from "./profileFollow.ts";

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
      .map((followee) => ({
        id: String(followee.id),
        handle: String(followee.handle),
        displayName: String(followee.display_name),
        avatarUrl: typeof followee.avatar_url === "string" ? followee.avatar_url : null,
        bio: typeof followee.bio === "string" ? followee.bio : null,
      }));
  }
}
