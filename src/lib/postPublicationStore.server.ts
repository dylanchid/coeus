import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseArchiveSyncSnapshot } from "./archiveSync.ts";
import { derivePostSnapshot, parsePostSnapshot, type Post, type PublishPostRequest } from "./post.ts";
import { PostItemNotFoundError } from "./postErrors.ts";
import type { OwnedPost } from "./publicProfile.ts";
import type { Visibility } from "./visibility.ts";

export { PostItemNotFoundError };

/**
 * The read path for an author's published posts, feeding the profile Posts tab
 * and the Discover "Following" view. Mirrors how PublicCollectionReader lives
 * beside CollectionPublicationStore: every tier comes back, and the
 * isListable/canSee cut happens in deriveProfileView — exactly as
 * listOwnedPublications returns unpublished rows for the derive layer to filter.
 */
export interface PublicPostReader {
  listByAuthor(authorId: string): Promise<OwnedPost[]>;
}

/**
 * Writes to the posts table (20260906150000_posts.sql) go through the
 * publish_post / unpublish_post RPCs only. This store is the API-layer's one
 * door to them, and it derives the public-safe payload from the owner's OWN
 * archive snapshot — the request body never carries post fields, exactly how
 * SupabaseCollectionPublicationStore.publish() works.
 */
export interface PostPublicationStore {
  publish(ownerId: string, request: PublishPostRequest): Promise<Post>;
  unpublish(ownerId: string, itemLocalId: string): Promise<boolean>;
}

export class SupabasePostPublicationStore implements PostPublicationStore, PublicPostReader {
  // A TS parameter-property constructor breaks tests importing this module under
  // node --experimental-strip-types — see collectionPublicationStore.server.ts.
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Every post this author has published, newest first — all tiers. The admin
   * client bypasses RLS; the visibility cut is deriveProfileView's job. One
   * index-only scan on posts_author_live_idx (author_id, created_at desc).
   */
  async listByAuthor(authorId: string): Promise<OwnedPost[]> {
    const { data, error } = await this.supabase
      .from("posts")
      .select("item_local_id,title,url,source_name,author,excerpt,commentary,visibility,created_at,updated_at")
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      itemLocalId: String(row.item_local_id),
      title: String(row.title),
      url: String(row.url),
      sourceName: String(row.source_name ?? ""),
      author: String(row.author ?? ""),
      excerpt: String(row.excerpt ?? ""),
      commentary: String(row.commentary ?? ""),
      visibility: row.visibility as Visibility,
      publishedAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  }

  async publish(ownerId: string, request: PublishPostRequest): Promise<Post> {
    const item = await this.archiveItem(ownerId, request.itemLocalId);

    const snapshot = derivePostSnapshot(item, {
      visibility: request.visibility,
      commentary: request.commentary,
    });
    const validated = parsePostSnapshot(snapshot);
    if (!validated.ok) throw new Error(`Derived post is invalid: ${validated.error}`);

    const { data, error } = await this.supabase
      .rpc("publish_post", {
        p_owner_id: ownerId,
        p_item_local_id: validated.value.itemLocalId,
        p_visibility: validated.value.visibility,
        p_title: validated.value.title,
        p_url: validated.value.url,
        p_source_name: validated.value.sourceName,
        p_author: validated.value.author,
        p_excerpt: validated.value.excerpt,
        p_commentary: validated.value.commentary,
      })
      .single();
    if (error) throw error;

    const row = data as { post_id: string; created_at: string; updated_at: string };
    return {
      ...validated.value,
      id: row.post_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async unpublish(ownerId: string, itemLocalId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("unpublish_post", {
      p_owner_id: ownerId,
      p_item_local_id: itemLocalId,
    });
    if (error) throw error;
    return Boolean(data);
  }

  /**
   * The item as it currently stands in the owner's archive. A missing archive,
   * or an item id the owner does not have, is a {@link PostItemNotFoundError} —
   * the caller maps it to 404, never 500. This is also the ownership check:
   * the snapshot is looked up by owner_id, so a caller can only ever publish
   * their own items.
   */
  private async archiveItem(ownerId: string, itemLocalId: string) {
    const { data: archive, error: archiveError } = await this.supabase
      .from("archives")
      .select("id,current_revision")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (archiveError) throw archiveError;
    if (!archive) throw new PostItemNotFoundError("Item not found");

    const { id, current_revision: currentRevision } = archive as { id: string; current_revision: number };
    const { data: revision, error: revisionError } = await this.supabase
      .from("archive_revisions")
      .select("snapshot")
      .eq("archive_id", id)
      .eq("revision", currentRevision)
      .single();
    if (revisionError) throw revisionError;

    const parsed = parseArchiveSyncSnapshot((revision as { snapshot: unknown }).snapshot);
    if (!parsed.ok) throw new Error(`Stored archive is corrupt: ${parsed.error}`);

    const item = parsed.value.archive.items.find((candidate) => candidate.id === itemLocalId);
    if (!item) throw new PostItemNotFoundError("Item not found");
    return item;
  }
}
