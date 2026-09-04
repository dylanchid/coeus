import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseArchiveSyncSnapshot, type ArchiveSyncSnapshot } from "./archiveSync.ts";
import {
  derivePublicationSnapshot,
  parsePublicationSnapshot,
  proposeSlug,
  slugWithSuffix,
  type CollectionPublication,
  type PublishCollectionRequest,
} from "./collectionPublication.ts";

const MAX_SLUG_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

export interface CollectionPublicationStore {
  list(ownerId: string): Promise<CollectionPublication[]>;
  publish(ownerId: string, request: PublishCollectionRequest): Promise<CollectionPublication>;
  unpublish(ownerId: string, collectionLocalId: string): Promise<boolean>;
}

/** Unauthenticated read path for public collection pages and RSS output. */
export interface PublicCollectionReader {
  getBySlug(slug: string): Promise<CollectionPublication | null>;
}

export class CollectionNotFoundError extends Error {}
export class SlugExhaustedError extends Error {}

function randomToken(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
}

function toPublication(data: Record<string, unknown>, items: Record<string, unknown>[]): CollectionPublication {
  return {
    id: String(data.id),
    archiveId: String(data.archive_id),
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

export class SupabaseCollectionPublicationStore implements CollectionPublicationStore, PublicCollectionReader {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Unauthenticated read by stable slug. The admin client bypasses RLS, so
   * visibility/unpublished filtering happens explicitly here rather than
   * relying on the collection_publications RLS policy (defense-in-depth for
   * a hypothetical future direct client read, not the enforcement point).
   */
  async getBySlug(slug: string): Promise<CollectionPublication | null> {
    const { data, error } = await this.supabase
      .from("collection_publications")
      .select("*")
      .eq("slug", slug)
      .is("unpublished_at", null)
      .in("visibility", ["public", "unlisted"])
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: items, error: itemsError } = await this.supabase
      .from("collection_publication_items")
      .select("*")
      .eq("publication_id", (data as { id: string }).id);
    if (itemsError) throw itemsError;
    return toPublication(data as Record<string, unknown>, (items ?? []) as Record<string, unknown>[]);
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
    const { data: items, error: itemsError } = await this.supabase
      .from("collection_publication_items")
      .select("*")
      .in("publication_id", rows.map((entry) => entry.id));
    if (itemsError) throw itemsError;
    const itemsByPublication = new Map<string, Record<string, unknown>[]>();
    for (const item of (items ?? []) as Record<string, unknown>[]) {
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
    const { data: items, error: itemsError } = await this.supabase
      .from("collection_publication_items")
      .select("*")
      .eq("publication_id", publicationId);
    if (itemsError) throw itemsError;
    return toPublication(data as Record<string, unknown>, (items ?? []) as Record<string, unknown>[]);
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
