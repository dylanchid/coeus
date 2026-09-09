// No "server-only": conversationProfileStore.server.test.mjs exercises the
// query-budget contract below through a fake Supabase client, so this module
// must stay importable under `node --experimental-strip-types`. It holds no
// secret — the admin client is injected by the caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoadedInteraction, LoadedReply, LoadedTarget } from "./conversationProfile.ts";
import type { Visibility } from "./visibility.ts";

const REPLY_ROOT_LIMIT = 50;
const INTERACTION_LIMIT = 100;
/**
 * The fan-out cap on each descendant level of a reply thread. Without it a
 * single popular thread root could pull thousands of child rows into one
 * PostgREST payload (bt0). 200 per level, two levels deep, is a hard ceiling
 * on the descendants any one profile render can load; a thread busier than
 * that shows its first 200 replies per level in thread order and the rest
 * lives on the dedicated thread page.
 */
const REPLY_DESCENDANT_LIMIT = 200;

interface InteractionRow {
  created_at: string;
  target_type: "collection" | "post";
  target_id: string;
}

/**
 * The read side of the conversation layer for the profile page: an actor's
 * likes, reposts and reply threads, each with its target FRESHLY JOINED from
 * the live `collection_publications` / `posts` row. Never denormalised — the
 * derive layer (conversationProfile.ts) re-checks every target through
 * canSeeIndirect(), and a lazy read of a stored title would bypass it.
 *
 * The admin client bypasses RLS on purpose; the visibility cut is the derive
 * layer's job, exactly as SupabasePostPublicationStore.listByAuthor works.
 */
export interface ConversationProfileReader {
  listLikesByActor(actorId: string): Promise<LoadedInteraction[]>;
  listRepostsByActor(actorId: string): Promise<LoadedInteraction[]>;
  /** Root replies by this author + two levels of descendants (any author). */
  listRepliesByActor(actorId: string): Promise<LoadedReply[]>;
  /** Which of `ownerIds` does `viewerId` follow? For the `followers`-tier
   * target check, resolved once across every distinct target owner. */
  followsAmong(viewerId: string, ownerIds: readonly string[]): Promise<Set<string>>;
}

export class SupabaseConversationProfileReader implements ConversationProfileReader {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async listLikesByActor(actorId: string): Promise<LoadedInteraction[]> {
    return this.loadInteractions("likes", actorId);
  }

  async listRepostsByActor(actorId: string): Promise<LoadedInteraction[]> {
    return this.loadInteractions("reposts", actorId);
  }

  private async loadInteractions(table: "likes" | "reposts", actorId: string): Promise<LoadedInteraction[]> {
    const { data, error } = await this.supabase
      .from(table)
      .select("created_at,target_type,target_id")
      .eq("actor_id", actorId)
      .order("created_at", { ascending: false })
      .limit(INTERACTION_LIMIT);
    if (error) throw error;

    const rows = (data ?? []) as InteractionRow[];
    const targets = await this.resolveTargets(rows);
    return rows.map((row) => ({
      createdAt: row.created_at,
      target: targets.get(`${row.target_type}:${row.target_id}`) ?? null,
    }));
  }

  async listRepliesByActor(actorId: string): Promise<LoadedReply[]> {
    // 1. this author's thread roots.
    const { data: rootData, error: rootError } = await this.supabase
      .from("replies")
      .select("id,parent_id,author_id,target_type,target_id,body,visibility,created_at,updated_at")
      .eq("author_id", actorId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(REPLY_ROOT_LIMIT);
    if (rootError) throw rootError;
    const roots = (rootData ?? []) as ReplyRow[];
    if (!roots.length) return [];

    // 2. direct responses to those roots, then 3. one level deeper. Two bounded
    //    index lookups on replies_parent_idx — no recursive CTE.
    const level2 = await this.childrenOf(roots.map((r) => r.id));
    const level3 = level2.length ? await this.childrenOf(level2.map((r) => r.id)) : [];
    const all = [...roots, ...level2, ...level3];

    const targets = await this.resolveTargets(all);
    // Parent author handles, for the "replying to @handle" lead on level 3.
    const authorHandles = await this.handlesFor(all.map((r) => r.author_id));
    const byId = new Map(all.map((r) => [r.id, r]));

    return all.map((row) => {
      const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
      return {
        id: row.id,
        parentId: row.parent_id,
        body: row.body,
        visibility: row.visibility,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        targetType: row.target_type,
        targetId: row.target_id,
        target: targets.get(`${row.target_type}:${row.target_id}`) ?? null,
        parentAuthorHandle: parent ? authorHandles.get(parent.author_id) ?? null : null,
      };
    });
  }

  private async childrenOf(parentIds: string[]): Promise<ReplyRow[]> {
    if (!parentIds.length) return [];
    const { data, error } = await this.supabase
      .from("replies")
      .select("id,parent_id,author_id,target_type,target_id,body,visibility,created_at,updated_at")
      .in("parent_id", parentIds)
      .order("created_at", { ascending: true })
      .limit(REPLY_DESCENDANT_LIMIT);
    if (error) throw error;
    return (data ?? []) as ReplyRow[];
  }

  async followsAmong(viewerId: string, ownerIds: readonly string[]): Promise<Set<string>> {
    const distinct = [...new Set(ownerIds)].filter(Boolean);
    if (!distinct.length) return new Set();
    const { data, error } = await this.supabase
      .from("profile_follows")
      .select("followee_id")
      .eq("follower_id", viewerId)
      .in("followee_id", distinct);
    if (error) throw error;
    return new Set(((data ?? []) as { followee_id: string }[]).map((row) => row.followee_id));
  }

  /**
   * Resolve every distinct (target_type, target_id) in `rows` to a
   * {@link LoadedTarget}. A collection that is currently unpublished, or a row
   * pointing at a since-deleted target, is simply absent from the map — the
   * derive layer reads that as null and drops it.
   */
  private async resolveTargets(
    rows: readonly { target_type: "collection" | "post"; target_id: string }[],
  ): Promise<Map<string, LoadedTarget>> {
    const collectionIds = [...new Set(rows.filter((r) => r.target_type === "collection").map((r) => r.target_id))];
    const postIds = [...new Set(rows.filter((r) => r.target_type === "post").map((r) => r.target_id))];
    const map = new Map<string, LoadedTarget>();

    if (collectionIds.length) {
      const { data, error } = await this.supabase
        .from("collection_publications")
        .select("id,slug,name,visibility,owner_id,unpublished_at")
        .in("id", collectionIds);
      if (error) throw error;
      const live = ((data ?? []) as CollectionRow[]).filter((row) => row.unpublished_at === null);
      const handles = await this.handlesFor(live.map((row) => row.owner_id));
      for (const row of live) {
        map.set(`collection:${row.id}`, {
          kind: "collection",
          slug: row.slug,
          name: row.name,
          visibility: row.visibility,
          ownerId: row.owner_id,
          ownerHandle: handles.get(row.owner_id) ?? "",
        });
      }
    }

    if (postIds.length) {
      const { data, error } = await this.supabase
        .from("posts")
        .select("id,title,url,source_name,author,visibility,author_id")
        .in("id", postIds);
      if (error) throw error;
      const posts = (data ?? []) as PostRow[];
      const handles = await this.handlesFor(posts.map((row) => row.author_id));
      for (const row of posts) {
        map.set(`post:${row.id}`, {
          kind: "post",
          title: row.title,
          url: row.url,
          sourceName: row.source_name ?? "",
          author: row.author ?? "",
          visibility: row.visibility,
          ownerId: row.author_id,
          ownerHandle: handles.get(row.author_id) ?? "",
        });
      }
    }

    return map;
  }

  /** id → handle for a set of account ids (profiles.id == auth.users.id). */
  private async handlesFor(ids: readonly string[]): Promise<Map<string, string>> {
    const distinct = [...new Set(ids)].filter(Boolean);
    if (!distinct.length) return new Map();
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id,handle")
      .in("id", distinct);
    if (error) throw error;
    return new Map(((data ?? []) as { id: string; handle: string }[]).map((row) => [row.id, row.handle]));
  }
}

interface ReplyRow {
  id: string;
  parent_id: string | null;
  author_id: string;
  target_type: "collection" | "post";
  target_id: string;
  body: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
}

interface CollectionRow {
  id: string;
  slug: string;
  name: string;
  visibility: Visibility;
  owner_id: string;
  unpublished_at: string | null;
}

interface PostRow {
  id: string;
  title: string;
  url: string;
  source_name: string | null;
  author: string | null;
  visibility: Visibility;
  author_id: string;
}
