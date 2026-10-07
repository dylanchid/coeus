// No server-only guard: the store has an injected Supabase client and its fake
// query contract is exercised by unit tests under node strip-types.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encodeNotificationCursor,
  type NotificationCursor,
  type NotificationItem,
  type NotificationPage,
} from "./notifications.ts";

const MAX_PAGE_SIZE = 50;

type NotificationRow = {
  id: string;
  kind: "follow" | "like" | "reply" | "repost";
  actor_id: string | null;
  target_type: "collection" | "post" | null;
  target_id: string | null;
  reply_id: string | null;
  created_at: string;
  read_at: string | null;
  actor:
    | {
        handle: string;
        display_name: string;
        avatar_url: string | null;
      }
    | {
        handle: string;
        display_name: string;
        avatar_url: string | null;
      }[]
    | null;
};

type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  visibility: "public" | "unlisted";
  unpublished_at: string | null;
};

type PostRow = {
  id: string;
  title: string;
  author_id: string;
  visibility: "private" | "followers" | "public" | "unlisted";
};

type ProfileRow = { id: string; handle: string };

export interface NotificationPageRequest {
  cursor: NotificationCursor | null;
  limit: number;
}

export interface NotificationStore {
  list(recipientId: string, request: NotificationPageRequest): Promise<NotificationPage>;
  unreadCount(recipientId: string): Promise<number>;
  markAllRead(recipientId: string): Promise<number>;
}

export class SupabaseNotificationStore implements NotificationStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async list(recipientId: string, request: NotificationPageRequest): Promise<NotificationPage> {
    const limit = Math.min(Math.max(Math.trunc(request.limit), 1), MAX_PAGE_SIZE);
    let query = this.supabase
      .from("notifications")
      .select("id,kind,actor_id,target_type,target_id,reply_id,created_at,read_at,actor:profiles!notifications_actor_id_fkey(handle,display_name,avatar_url)")
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (request.cursor) {
      const { ts, id } = request.cursor;
      query = query.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as NotificationRow[];
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const targets = await this.resolveTargets(recipientId, pageRows);
    const items: NotificationItem[] = pageRows.map((row) => {
      const actor = Array.isArray(row.actor) ? row.actor[0] ?? null : row.actor;
      return {
        id: row.id,
        kind: row.kind,
        targetType: row.target_type,
        actor: actor
          ? { handle: actor.handle, displayName: actor.display_name, avatarUrl: actor.avatar_url }
          : null,
        target: row.target_type && row.target_id ? targets.get(`${row.target_type}:${row.target_id}`) ?? null : null,
        createdAt: row.created_at,
        readAt: row.read_at,
      };
    });
    const last = pageRows[pageRows.length - 1];

    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeNotificationCursor({ ts: last.created_at, id: last.id }) : null,
      unreadCount: await this.unreadCount(recipientId),
    };
  }

  async unreadCount(recipientId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", recipientId)
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  async markAllRead(recipientId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", recipientId)
      .is("read_at", null)
      .select("id");
    if (error) throw error;
    return (data ?? []).length;
  }

  private async resolveTargets(recipientId: string, rows: readonly NotificationRow[]) {
    const collectionIds = [...new Set(rows.filter((row) => row.target_type === "collection" && row.target_id).map((row) => row.target_id!))];
    const postIds = [...new Set(rows.filter((row) => row.target_type === "post" && row.target_id).map((row) => row.target_id!))];
    const collections = new Map<string, CollectionRow>();
    const posts = new Map<string, PostRow>();

    if (collectionIds.length) {
      const { data, error } = await this.supabase
        .from("collection_publications")
        .select("id,slug,name,owner_id,visibility,unpublished_at")
        .in("id", collectionIds);
      if (error) throw error;
      for (const row of (data ?? []) as CollectionRow[]) collections.set(row.id, row);
    }
    if (postIds.length) {
      const { data, error } = await this.supabase
        .from("posts")
        .select("id,title,author_id,visibility")
        .in("id", postIds);
      if (error) throw error;
      for (const row of (data ?? []) as PostRow[]) posts.set(row.id, row);
    }

    const ownerIds = [
      ...collections.values().map((row) => row.owner_id),
      ...posts.values().map((row) => row.author_id),
    ];
    const profiles = await this.handlesFor(ownerIds);
    const targets = new Map<string, NotificationItem["target"]>();

    for (const row of collections.values()) {
      const handle = profiles.get(row.owner_id);
      const visible = row.unpublished_at === null && (row.visibility === "public" || row.owner_id === recipientId);
      if (visible && handle) {
        targets.set(`collection:${row.id}`, { type: "collection", label: row.name, href: `/c/${row.slug}` });
      }
    }
    for (const row of posts.values()) {
      const handle = profiles.get(row.author_id);
      const visible = row.visibility === "public" || row.visibility === "unlisted" || row.author_id === recipientId;
      if (visible && handle) {
        targets.set(`post:${row.id}`, { type: "post", label: row.title, href: `/@${handle}?tab=posts` });
      }
    }
    return targets;
  }

  private async handlesFor(ids: readonly string[]): Promise<Map<string, string>> {
    const distinct = [...new Set(ids)].filter(Boolean);
    if (!distinct.length) return new Map();
    const { data, error } = await this.supabase.from("profiles").select("id,handle").in("id", distinct);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [(row as ProfileRow).id, (row as ProfileRow).handle]));
  }
}
