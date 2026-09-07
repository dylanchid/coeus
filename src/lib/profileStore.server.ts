import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  HandleChangeRateLimitedError,
  HandleQuarantinedError,
  HandleTakenError,
  HANDLE_CHANGES_PER_YEAR,
} from "./profileErrors.ts";
import { HANDLE_PATTERN, normalizeHandle, validateProfileLinks, type Profile, type ProfileInput, type ProfileLink } from "./profile.ts";
import { isPublicationVisibility } from "./collectionPublication.ts";
import type { ProfileSectionsPatch, ProfileSectionSwitches } from "./profileSections.ts";
import type { OwnedPublication } from "./publicProfile.ts";

const SECTION_COLUMNS =
  "show_followers,show_following,show_reposts,show_replies,show_likes,likes_visibility";

function sectionSwitches(row: Record<string, unknown>): ProfileSectionSwitches {
  return {
    showFollowers: row.show_followers !== false,
    showFollowing: row.show_following !== false,
    showReposts: row.show_reposts !== false,
    showReplies: row.show_replies !== false,
    showLikes: row.show_likes !== false,
    likesVisibility: isPublicationVisibility(row.likes_visibility) ? row.likes_visibility : "public",
  };
}

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
    // The show_* / likes_visibility columns ride along in every profile read,
    // so the profile page and the followers/following routes never pay an
    // extra query to know which sections the owner wants rendered.
    sections: sectionSwitches(row),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// Keep this a single string literal (not a concatenation) so PostgREST's
// .select() keeps its parsed column typing. The section columns here must stay
// in sync with SECTION_COLUMNS above.
const COLUMNS =
  "id,handle,display_name,bio,location,links,avatar_url,cover_url,pinned_collection_slugs,show_followers,show_following,show_reposts,show_replies,show_likes,likes_visibility,created_at,updated_at";

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
  /**
   * Partial update of just the section switches and likes_visibility, so
   * toggling one switch never re-sends the whole profile. Null when the caller
   * has no profile row yet (onboarding not done).
   */
  updateSections(userId: string, patch: ProfileSectionsPatch): Promise<ProfileSectionSwitches | null>;
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
    // A handle that differs from the stored one is a *change*, not a plain
    // column write: the old handle has to be released into handle_history in
    // the same transaction as the rename (sub-epic 4). That, the quarantine
    // check and the rate limit all live in changeHandle() below; a first-time
    // save (no row yet) and a save that keeps the same handle skip it entirely.
    const { data: existingRow, error: existingError } = await this.supabase
      .from("profiles")
      .select("handle")
      .eq("id", userId)
      .maybeSingle();
    if (existingError) throw existingError;
    const currentHandle = existingRow ? String((existingRow as { handle: string }).handle) : null;
    if (currentHandle !== null && currentHandle !== input.handle) {
      await this.changeHandle(userId, input.handle);
    }

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
   * Release this account's current handle and take `newHandle`, via the
   * `change_handle` security-definer RPC so the release and the rename commit
   * together. Guards, in order:
   *   - rate limit: at most HANDLE_CHANGES_PER_YEAR releases per rolling 365
   *     days, counted straight from handle_history (a serverless-safe count —
   *     FixedWindowBudget is process-local and no use for a year-long window);
   *   - handle currently taken → HandleTakenError (23505);
   *   - handle quarantined by another account → HandleQuarantinedError (HQ001).
   * A failed RPC writes no history row, so a rejected attempt never counts
   * against the rate limit.
   */
  private async changeHandle(userId: string, newHandle: string): Promise<void> {
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - YEAR_MS).toISOString();
    const { data: recent, error: recentError } = await this.supabase
      .from("handle_history")
      .select("released_at")
      .eq("profile_id", userId)
      .gte("released_at", windowStart)
      .order("released_at", { ascending: true });
    if (recentError) throw recentError;
    if ((recent?.length ?? 0) >= HANDLE_CHANGES_PER_YEAR) {
      const oldest = new Date(String((recent![0] as { released_at: string }).released_at));
      throw new HandleChangeRateLimitedError(new Date(oldest.getTime() + YEAR_MS));
    }

    const { error } = await this.supabase.rpc("change_handle", {
      p_profile_id: userId,
      p_new_handle: newHandle,
    });
    if (!error) return;
    if (error.code === "23505") throw new HandleTakenError(`Handle "${newHandle}" is taken`);
    if (error.code === "HQ001") {
      throw new HandleQuarantinedError(`Handle "${newHandle}" was released by another account in the last 30 days`);
    }
    throw error;
  }

  async updateSections(userId: string, patch: ProfileSectionsPatch): Promise<ProfileSectionSwitches | null> {
    const row: Record<string, unknown> = {};
    if (patch.showFollowers !== undefined) row.show_followers = patch.showFollowers;
    if (patch.showFollowing !== undefined) row.show_following = patch.showFollowing;
    if (patch.showReposts !== undefined) row.show_reposts = patch.showReposts;
    if (patch.showReplies !== undefined) row.show_replies = patch.showReplies;
    if (patch.showLikes !== undefined) row.show_likes = patch.showLikes;
    if (patch.likesVisibility !== undefined) row.likes_visibility = patch.likesVisibility;

    const { data, error } = await this.supabase
      .from("profiles")
      .update(row)
      .eq("id", userId)
      .select(SECTION_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data ? sectionSwitches(data as Record<string, unknown>) : null;
  }

  /**
   * Resolve a public handle to a profile. THE ONLY handle lookup in the
   * codebase — every route and API that needs a profile-by-handle calls this.
   * A hit in `profiles` returns `redirectFrom: null`; a hit only in
   * `handle_history` returns the profile's current row with `redirectFrom` set
   * to the retired handle, and the caller 308s to the canonical `/@handle`.
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
    if (data) {
      return { profile: profileRow(data as Record<string, unknown>), redirectFrom: null };
    }

    // Miss in profiles: the handle may have been retired (sub-epic 4). Look it
    // up in handle_history and resolve the profile that released it by *id*, so
    // the redirect target is always that profile's CURRENT handle — a handle
    // changed twice (a → b → c) still redirects /@a straight to /@c, never
    // through /@b. handle_history.old_handle is a primary key, so at most one row.
    const { data: retired, error: retiredError } = await this.supabase
      .from("handle_history")
      .select("profile_id")
      .eq("old_handle", normalized)
      .maybeSingle();
    if (retiredError) throw retiredError;
    if (!retired) return null;

    const { data: current, error: currentError } = await this.supabase
      .from("profiles")
      .select(COLUMNS)
      .eq("id", (retired as { profile_id: string }).profile_id)
      .maybeSingle();
    if (currentError) throw currentError;
    // on delete cascade means an orphaned history row should not exist; if one
    // does, treat the URL as a 404 rather than redirecting into nothing.
    if (!current) return null;

    return { profile: profileRow(current as Record<string, unknown>), redirectFrom: normalized };
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
