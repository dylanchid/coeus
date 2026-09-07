import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  combineFollowedFeed,
  type FollowedFeedCandidate,
  type FollowedFeedPage,
} from "./followedFeed.ts";
import type { Visibility } from "./visibility.ts";

export type { FollowedFeedItem, FollowedFeedPage } from "./followedFeed.ts";

/**
 * The server reader behind the Discover "Following" view. It fetches raw
 * collection + post rows from people the viewer follows and hands them to
 * combineFollowedFeed() (followedFeed.ts), which owns the visibility cut and
 * ordering. Mirrors how listPublic() lives beside its pure snapshot helpers.
 */
export interface FollowedFeedReader {
  listFollowedPeopleContent(viewerId: string, limit: number, offset: number): Promise<FollowedFeedPage>;
}

const MAX_FOLLOWED_FEED_PAGE_SIZE = 50;

export class SupabaseFollowedFeedReader implements FollowedFeedReader {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listFollowedPeopleContent(viewerId: string, limit: number, offset: number): Promise<FollowedFeedPage> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_FOLLOWED_FEED_PAGE_SIZE);
    const boundedOffset = Math.max(Math.trunc(offset), 0);

    const { data: follows, error: followsError } = await this.supabase
      .from("profile_follows")
      .select("followee_id")
      .eq("follower_id", viewerId);
    if (followsError) throw followsError;
    const followeeIds = ((follows ?? []) as { followee_id: string }[]).map((row) => row.followee_id);
    // No follows → no content query at all.
    if (!followeeIds.length) return { items: [], hasMore: false };

    // Cap each table's fetch at what a full page could need; the union's top
    // rows are guaranteed to sit inside each table's own top rows.
    const cap = boundedOffset + boundedLimit + 1;
    const [collections, posts] = await Promise.all([
      this.collectionCandidates(followeeIds, cap),
      this.postCandidates(followeeIds, cap),
    ]);

    // The viewer follows every author in the set, so `follower` is the right
    // viewer kind: it admits public + followers and rejects private + unlisted.
    return combineFollowedFeed([...collections, ...posts], { kind: "follower", id: viewerId }, boundedLimit, boundedOffset);
  }

  private async collectionCandidates(ownerIds: string[], cap: number): Promise<FollowedFeedCandidate[]> {
    const { data, error } = await this.supabase
      .from("collection_publications")
      .select("slug,name,description,curator_note,attribution,visibility,published_at,collection_publication_items(count)")
      .in("owner_id", ownerIds)
      .is("unpublished_at", null)
      .order("published_at", { ascending: false })
      .limit(cap);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      visibility: row.visibility as Visibility,
      item: {
        kind: "collection",
        publishedAt: String(row.published_at),
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description ?? ""),
        curatorNote: String(row.curator_note ?? ""),
        attribution: String(row.attribution ?? ""),
        itemCount: embeddedCount(row.collection_publication_items),
      },
    }));
  }

  private async postCandidates(authorIds: string[], cap: number): Promise<FollowedFeedCandidate[]> {
    const { data, error } = await this.supabase
      .from("posts")
      .select("title,url,source_name,author,excerpt,commentary,visibility,created_at")
      .in("author_id", authorIds)
      .order("created_at", { ascending: false })
      .limit(cap);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      visibility: row.visibility as Visibility,
      item: {
        kind: "post",
        publishedAt: String(row.created_at),
        title: String(row.title),
        url: String(row.url),
        sourceName: String(row.source_name ?? ""),
        author: String(row.author ?? ""),
        excerpt: String(row.excerpt ?? ""),
        commentary: String(row.commentary ?? ""),
      },
    }));
  }
}

function embeddedCount(value: unknown): number {
  if (Array.isArray(value) && value.length && typeof value[0] === "object" && value[0]) {
    const count = (value[0] as { count?: unknown }).count;
    return typeof count === "number" ? count : 0;
  }
  return 0;
}
