import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseArchiveSyncSnapshot, type ArchiveSyncSnapshot } from "./archiveSync.ts";
import {
  derivePublicationSnapshot,
  parsePublicationSnapshot,
  proposeSlug,
  slugWithSuffix,
  type CollectionPublication,
  type CollectionPublicationSummary,
  type PublishCollectionRequest,
} from "./collectionPublication.ts";
import { CollectionNotFoundError, SlugExhaustedError } from "./collectionPublicationErrors.ts";
import { readAllPages } from "./pagedRead.ts";

export { CollectionNotFoundError, SlugExhaustedError };

const MAX_SLUG_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";
const MAX_DISCOVER_PAGE_SIZE = 50;

export interface CollectionPublicationStore {
  list(ownerId: string): Promise<CollectionPublication[]>;
  publish(ownerId: string, request: PublishCollectionRequest): Promise<CollectionPublication>;
  unpublish(ownerId: string, collectionLocalId: string): Promise<boolean>;
}

/** Unauthenticated read path for public collection pages and RSS output. */
export interface PublicCollectionReader {
  getBySlug(slug: string): Promise<CollectionPublication | null>;
  /**
   * public (not unlisted) collections only, per the design: unlisted stays
   * reachable by direct link but never appears in a discovery listing.
   */
  listPublic(limit: number, offset: number): Promise<{ items: CollectionPublicationSummary[]; hasMore: boolean }>;
}

export interface CollectionFollowStore {
  follow(followerId: string, publicationId: string): Promise<void>;
  unfollow(followerId: string, publicationId: string): Promise<void>;
  listFollowed(followerId: string): Promise<CollectionPublication[]>;
}

function randomToken(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
}

function toPublication(data: Record<string, unknown>, items: Record<string, unknown>[]): CollectionPublication {
  return {
    id: String(data.id),
    archiveId: String(data.archive_id),
    ownerId: String(data.owner_id),
    collectionLocalId: String(data.collection_local_id),
    slug: String(data.slug),
    visibility: data.visibility as CollectionPublication["visibility"],
    name: String(data.name),
    description: String(data.description ?? ""),
    curatorNote: String(data.curator_note ?? ""),
    attribution: String(data.attribution ?? ""),
    publishedAt: String(data.published_at),
    updatedAt: String(data.updated_at),
    unpublishedAt: typeof data.unpublished_at === "string" ? data.unpublished_at : null,
    items: items
      .slice()
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((item) => ({
        itemLocalId: String(item.item_local_id),
        position: Number(item.position),
        title: String(item.title),
        url: String(item.url),
        sourceName: String(item.source_name ?? ""),
        author: String(item.author ?? ""),
        excerpt: String(item.excerpt ?? ""),
        curatorComment: String(item.curator_comment ?? ""),
      })),
  };
}

export class SupabaseCollectionPublicationStore
  implements CollectionPublicationStore, PublicCollectionReader, CollectionFollowStore
{
  // A TS parameter-property constructor here breaks any test file that imports this
  // module under node --experimental-strip-types (strip-only, no transform) — see
  // archiveSyncStore.server.ts, which avoids the same shorthand for that reason.
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Read by stable slug. The admin client bypasses RLS, so this returns a row
   * at ANY visibility tier that is still live — the caller (the /c/[slug] page)
   * resolves a Viewer and applies canSee() for the private/followers tiers.
   * public/unlisted keep a zero-auth fast path there. Unpublished rows are
   * filtered here since there is no viewer for whom they are visible.
   */
  async getBySlug(slug: string): Promise<CollectionPublication | null> {
    const { data, error } = await this.supabase
      .from("collection_publications")
      .select("*")
      .eq("slug", slug)
      .is("unpublished_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const items = await this.collectionItems([String((data as { id: string }).id)]);
    return toPublication(data as Record<string, unknown>, items);
  }

  async listPublic(limit: number, offset: number): Promise<{ items: CollectionPublicationSummary[]; hasMore: boolean }> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_DISCOVER_PAGE_SIZE);
    const boundedOffset = Math.max(Math.trunc(offset), 0);
    const { data, error } = await this.supabase
      .from("collection_publications")
      .select("id,slug,name,description,curator_note,attribution,published_at,updated_at")
      .eq("visibility", "public")
      .is("unpublished_at", null)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      // one extra row beyond the page tells us whether there's a next page
      .range(boundedOffset, boundedOffset + boundedLimit);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    const hasMore = rows.length > boundedLimit;
    const page = rows.slice(0, boundedLimit);
    if (!page.length) return { items: [], hasMore: false };

    const items = await this.collectionItems(page.map((entry) => String(entry.id)), "publication_id");
    const counts = new Map<string, number>();
    for (const item of items as { publication_id: string }[]) {
      counts.set(item.publication_id, (counts.get(item.publication_id) ?? 0) + 1);
    }

    return {
      items: page.map((entry) => ({
        id: String(entry.id),
        slug: String(entry.slug),
        name: String(entry.name),
        description: String(entry.description ?? ""),
        curatorNote: String(entry.curator_note ?? ""),
        attribution: String(entry.attribution ?? ""),
        publishedAt: String(entry.published_at),
        updatedAt: String(entry.updated_at),
        itemCount: counts.get(String(entry.id)) ?? 0,
      })),
      hasMore,
    };
  }

  async follow(followerId: string, publicationId: string): Promise<void> {
    const { error } = await this.supabase
      .from("collection_follows")
      .upsert({ follower_id: followerId, publication_id: publicationId }, { onConflict: "publication_id,follower_id" });
    if (error) throw error;
  }

  async unfollow(followerId: string, publicationId: string): Promise<void> {
    const { error } = await this.supabase
      .from("collection_follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("publication_id", publicationId);
    if (error) throw error;
  }

  async listFollowed(followerId: string): Promise<CollectionPublication[]> {
    const { data: follows, error } = await this.supabase
      .from("collection_follows")
      .select("publication_id")
      .eq("follower_id", followerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const publicationIds = (follows ?? []).map((entry) => String((entry as { publication_id: string }).publication_id));
    if (!publicationIds.length) return [];

    const { data: publications, error: publicationsError } = await this.supabase
      .from("collection_publications")
      .select("*")
      .in("id", publicationIds)
      .is("unpublished_at", null);
    if (publicationsError) throw publicationsError;
    const rows = (publications ?? []) as Record<string, unknown>[];
    if (!rows.length) return [];

    const items = await this.collectionItems(rows.map((entry) => String(entry.id)));
    const itemsByPublication = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const key = String(item.publication_id);
      const grouped = itemsByPublication.get(key) ?? [];
      grouped.push(item);
      itemsByPublication.set(key, grouped);
    }

    // Preserve most-recently-followed-first order rather than the publications query's own ordering.
    const byId = new Map(rows.map((entry) => [String(entry.id), entry]));
    return publicationIds
      .map((id) => byId.get(id))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => toPublication(entry, itemsByPublication.get(String(entry.id)) ?? []));
  }

  async list(ownerId: string): Promise<CollectionPublication[]> {
    const archiveId = await this.archiveId(ownerId);
    if (!archiveId) return [];
    const { data: publications, error } = await this.supabase
      .from("collection_publications")
      .select("*")
      .eq("archive_id", archiveId)
      .order("published_at", { ascending: false });
    if (error) throw error;
    const rows = (publications ?? []) as Record<string, unknown>[];
    if (!rows.length) return [];
    const items = await this.collectionItems(rows.map((entry) => String(entry.id)));
    const itemsByPublication = new Map<string, Record<string, unknown>[]>();
    for (const item of items) {
      const key = String(item.publication_id);
      const grouped = itemsByPublication.get(key) ?? [];
      grouped.push(item);
      itemsByPublication.set(key, grouped);
    }
    return rows.map((entry) => toPublication(entry, itemsByPublication.get(String(entry.id)) ?? []));
  }

  async publish(ownerId: string, request: PublishCollectionRequest): Promise<CollectionPublication> {
    const { archiveId, snapshot } = await this.currentSnapshot(ownerId);
    const collection = snapshot.archive.collections.find((candidate) => candidate.id === request.collectionLocalId);
    if (!collection) throw new CollectionNotFoundError("Collection not found");

    const base = proposeSlug(collection.name);
    let candidateSlug = base;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const derived = derivePublicationSnapshot(collection, snapshot.archive.items, {
        visibility: request.visibility,
        slug: candidateSlug,
        curatorNote: request.curatorNote,
        attribution: request.attribution,
      });
      const validated = parsePublicationSnapshot(derived);
      if (!validated.ok) throw new Error(`Derived publication is invalid: ${validated.error}`);

      const { data, error } = await this.supabase
        .rpc("publish_collection", {
          p_owner_id: ownerId,
          p_archive_id: archiveId,
          p_collection_local_id: validated.value.collectionLocalId,
          p_slug: validated.value.slug,
          p_visibility: validated.value.visibility,
          p_name: validated.value.name,
          p_description: validated.value.description,
          p_curator_note: validated.value.curatorNote,
          p_attribution: validated.value.attribution,
          p_items: validated.value.items,
        })
        .single();

      if (error) {
        // A unique_violation here is almost always the slug; on a first publish, retry with a
        // disambiguated slug. (In the rare case of a concurrent double-publish race on the same
        // collection, this also retries harmlessly until MAX_SLUG_ATTEMPTS is exhausted.)
        if (error.code === UNIQUE_VIOLATION && attempt < MAX_SLUG_ATTEMPTS - 1) {
          candidateSlug = slugWithSuffix(base, randomToken());
          continue;
        }
        throw error;
      }
      const published = data as { publication_id: string };
      return this.publication(published.publication_id);
    }
    throw new SlugExhaustedError("Could not find an available slug for this collection");
  }

  async unpublish(ownerId: string, collectionLocalId: string): Promise<boolean> {
    const archiveId = await this.archiveId(ownerId);
    if (!archiveId) throw new CollectionNotFoundError("Collection not found");
    const { data, error } = await this.supabase.rpc("unpublish_collection", {
      p_owner_id: ownerId,
      p_archive_id: archiveId,
      p_collection_local_id: collectionLocalId,
    });
    if (error) throw error;
    return Boolean(data);
  }

  private async publication(publicationId: string): Promise<CollectionPublication> {
    const { data, error } = await this.supabase.from("collection_publications").select("*").eq("id", publicationId).single();
    if (error) throw error;
    const items = await this.collectionItems([publicationId]);
    return toPublication(data as Record<string, unknown>, items);
  }

  /** Page item rows and split large IN lists so neither PostgREST limit truncates an archive. */
  private async collectionItems(publicationIds: string[], columns = "*"): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    for (let start = 0; start < publicationIds.length; start += 500) {
      const ids = publicationIds.slice(start, start + 500);
      const page = await readAllPages((from, to) => this.supabase
        .from("collection_publication_items")
        .select(columns)
        .in("publication_id", ids)
        .order("publication_id")
        .order("position")
        .range(from, to));
      items.push(...(page as unknown as Record<string, unknown>[]));
    }
    return items;
  }

  private async archiveId(ownerId: string): Promise<string | null> {
    const { data, error } = await this.supabase.from("archives").select("id").eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    return data ? String((data as { id: string }).id) : null;
  }

  private async currentSnapshot(ownerId: string): Promise<{ archiveId: string; snapshot: ArchiveSyncSnapshot }> {
    const { data: archive, error: archiveError } = await this.supabase
      .from("archives")
      .select("id,current_revision")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (archiveError) throw archiveError;
    if (!archive) throw new CollectionNotFoundError("Archive not found");
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
    return { archiveId: id, snapshot: parsed.value };
  }
}
