import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { HandleTakenError } from "./profileErrors.ts";
import { HANDLE_PATTERN, normalizeHandle, validateProfileLinks, type Profile, type ProfileInput, type ProfileLink } from "./profile.ts";
import type { OwnedPublication } from "./publicProfile.ts";

function toLinks(raw: unknown): ProfileLink[] {
  const parsed = validateProfileLinks(raw);
  return parsed.ok ? parsed.value : [];
}

function toStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];
}

function profileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    bio: typeof row.bio === "string" ? row.bio : null,
    location: typeof row.location === "string" ? row.location : null,
    links: toLinks(row.links),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    coverUrl: typeof row.cover_url === "string" ? row.cover_url : null,
    pinnedCollectionSlugs: toStringArray(row.pinned_collection_slugs),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const COLUMNS =
  "id,handle,display_name,bio,location,links,avatar_url,cover_url,pinned_collection_slugs,created_at,updated_at";

/** The handle → profile lookup, wrapped in an envelope so sub-epic 4 can add a
 * redirect without changing any caller. In Phase 1 `redirectFrom` is always null. */
export interface HandleResolution {
  profile: Profile;
  redirectFrom: string | null;
}

/** Reads and writes one account's public profile. A missing row is a valid, expected state (onboarding not done). */
export interface ProfileStore {
  get(userId: string): Promise<Profile | null>;
  /** Insert-or-update this account's profile. Throws {@link HandleTakenError} when the handle belongs to someone else. */
  save(userId: string, input: ProfileInput): Promise<Profile>;
}

export class SupabaseProfileStore implements ProfileStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async get(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select(COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? profileRow(data as Record<string, unknown>) : null;
  }

  async save(userId: string, input: ProfileInput): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          handle: input.handle,
          display_name: input.displayName,
          bio: input.bio,
          location: input.location,
          links: input.links,
          avatar_url: input.avatarUrl,
          cover_url: input.coverUrl,
          pinned_collection_slugs: input.pinnedCollectionSlugs,
        },
        { onConflict: "id" }
      )
      .select(COLUMNS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) throw new HandleTakenError(`Handle "${input.handle}" is taken`);
      throw error;
    }
    return profileRow(data as Record<string, unknown>);
  }

  /**
   * Resolve a public handle to a profile. THE ONLY handle lookup in the
   * codebase — every route and API that needs a profile-by-handle calls this,
   * so sub-epic 4 (handle changes with redirects) can add the redirect path
   * here without touching a single caller.
   */
  async resolveHandle(handle: string): Promise<HandleResolution | null> {
    const normalized = normalizeHandle(handle);
    if (!HANDLE_PATTERN.test(normalized)) return null;
    const { data, error } = await this.supabase
      .from("profiles")
      .select(COLUMNS)
      .eq("handle", normalized)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // Phase 1: no redirect. Sub-epic 4 fills redirectFrom from handle_history.
    return { profile: profileRow(data as Record<string, unknown>), redirectFrom: null };
  }

  /**
   * Every collection this owner has ever published, newest first, including
   * ones since unpublished (the caller greys those for the owner and drops
   * them for a visitor). One query against the denormalised
   * collection_publications.owner_id — no hop through the owner-only archives
   * RLS. Item counts come back in the same request via the PostgREST
   * embedded aggregate.
   */
  async listOwnedPublications(profileId: string): Promise<OwnedPublication[]> {
    const { data, error } = await this.supabase
      .from("collection_publications")
      .select(
        "id,slug,name,description,curator_note,visibility,published_at,updated_at,unpublished_at," +
          "collection_publication_items(count),collection_follows(count)"
      )
      .eq("owner_id", profileId)
      .order("published_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description ?? ""),
      curatorNote: String(row.curator_note ?? ""),
      visibility: row.visibility as OwnedPublication["visibility"],
      publishedAt: String(row.published_at),
      updatedAt: String(row.updated_at),
      unpublishedAt: typeof row.unpublished_at === "string" ? row.unpublished_at : null,
      itemCount: embeddedCount(row.collection_publication_items),
      followerCount: embeddedCount(row.collection_follows),
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

function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === "23505";
}
