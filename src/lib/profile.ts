/**
 * Pure validation for the public profile a signed-in account fills in during
 * onboarding. The database enforces the same handle shape (see
 * 20260905132000_profiles.sql); this keeps the errors friendly and lets the
 * /welcome form reject bad input before it hits the API.
 */

import type { ProfileSectionSwitches } from "./profileSections.ts";

/** An external link on a profile. Ordered; at most {@link LINKS_MAX} per profile. */
export interface ProfileLink {
  label: string;
  url: string;
}

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  links: ProfileLink[];
  avatarUrl: string | null;
  coverUrl: string | null;
  pinnedCollectionSlugs: string[];
  /** The owner's profile-section display switches (show_* + likes_visibility).
   * Read from the profiles row by SupabaseProfileStore; DEFAULT_SECTION_SWITCHES
   * when a row predates the columns. */
  sections: ProfileSectionSwitches;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  handle: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  links: ProfileLink[];
  avatarUrl: string | null;
  coverUrl: string | null;
  pinnedCollectionSlugs: string[];
}

export type ProfileField = keyof ProfileInput;

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 280;
export const LOCATION_MAX = 80;
export const LINKS_MAX = 5;
export const LINK_LABEL_MAX = 60;
export const LINK_URL_MAX = 400;
export const PINNED_SLUGS_MAX = 12;

export type ProfileValidation =
  | { ok: true; value: ProfileInput }
  | { ok: false; errors: Partial<Record<ProfileField, string>> };

/** Lowercases and trims a candidate handle so "  Ada_L " and "ada_l" collide the way the unique index does. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ProfileLinksValidation =
  | { ok: true; value: ProfileLink[] }
  | { ok: false; error: string };

/**
 * Validate and normalise the external-links array. Mirrors the database
 * CHECK in 20260906120000_profile_surface.sql (profile_links_valid): an array
 * of at most {@link LINKS_MAX} {label, url} objects, each url http(s). The
 * API and the ProfileEditor client island both call this, so they cannot
 * disagree about what a valid link is.
 */
export function validateProfileLinks(raw: unknown): ProfileLinksValidation {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Links must be a list." };
  if (raw.length > LINKS_MAX) return { ok: false, error: `Add at most ${LINKS_MAX} links.` };

  const value: ProfileLink[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: "Each link needs a label and a URL." };
    }
    const label = typeof (entry as { label?: unknown }).label === "string"
      ? (entry as { label: string }).label.trim()
      : "";
    const url = typeof (entry as { url?: unknown }).url === "string"
      ? (entry as { url: string }).url.trim()
      : "";
    if (!label) return { ok: false, error: "Each link needs a label." };
    if (label.length > LINK_LABEL_MAX) return { ok: false, error: `Keep link labels under ${LINK_LABEL_MAX} characters.` };
    if (!isHttpUrl(url)) return { ok: false, error: "Each link URL must start with http:// or https://." };
    if (url.length > LINK_URL_MAX) return { ok: false, error: `Keep link URLs under ${LINK_URL_MAX} characters.` };
    value.push({ label, url });
  }
  return { ok: true, value };
}

/** Normalise a pinned-slug list: trim, drop blanks and non-slugs, dedupe, cap. */
export function normalizePinnedSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const slug = entry.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= PINNED_SLUGS_MAX) break;
  }
  return out;
}

const BUCKET_OBJECT_PREFIX = "/storage/v1/object/public/profile-media/";
const UID_SEGMENT = /^[0-9a-fA-F-]{36}$/;

/**
 * Accept an avatar/cover URL only if it is an `https` URL on the configured
 * Supabase Storage host, pointing inside the public `profile-media` bucket at a
 * `<uid>/` prefix. Anything else — a third-party host, `http`, an SVG hosted
 * elsewhere — is rejected, so a doctored `avatar_url` can never make a profile
 * page fetch an attacker origin (F-25). The database CHECK enforces the same
 * shape minus the host, which only this layer can see.
 */
export function normalizeBucketUrl(
  raw: unknown,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (typeof raw !== "string" || !raw.trim().length) return null;
  const value = raw.trim();

  let url: URL;
  let expectedHost: string;
  try {
    url = new URL(value);
    expectedHost = new URL(supabaseUrl ?? "").host;
  } catch {
    return null;
  }
  if (!expectedHost || url.protocol !== "https:" || url.host !== expectedHost) return null;
  if (!url.pathname.startsWith(BUCKET_OBJECT_PREFIX)) return null;

  const firstSegment = url.pathname.slice(BUCKET_OBJECT_PREFIX.length).split("/")[0];
  return UID_SEGMENT.test(firstSegment) ? value : null;
}

export function validateProfileInput(raw: {
  handle?: unknown;
  displayName?: unknown;
  bio?: unknown;
  location?: unknown;
  links?: unknown;
  avatarUrl?: unknown;
  coverUrl?: unknown;
  pinnedCollectionSlugs?: unknown;
}): ProfileValidation {
  const errors: Partial<Record<ProfileField, string>> = {};

  const handle = typeof raw.handle === "string" ? normalizeHandle(raw.handle) : "";
  if (!handle) {
    errors.handle = "Pick a handle.";
  } else if (!HANDLE_PATTERN.test(handle)) {
    errors.handle = "3–20 characters: lowercase letters, numbers, and underscores only.";
  }

  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  if (!displayName) {
    errors.displayName = "Add a display name.";
  } else if (displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Keep it under ${DISPLAY_NAME_MAX} characters.`;
  }

  const bioRaw = typeof raw.bio === "string" ? raw.bio.trim() : "";
  const bio = bioRaw.length ? bioRaw : null;
  if (bio && bio.length > BIO_MAX) {
    errors.bio = `Keep it under ${BIO_MAX} characters.`;
  }

  const locationRaw = typeof raw.location === "string" ? raw.location.trim() : "";
  const location = locationRaw.length ? locationRaw : null;
  if (location && location.length > LOCATION_MAX) {
    errors.location = `Keep it under ${LOCATION_MAX} characters.`;
  }

  const linksResult = validateProfileLinks(raw.links);
  const links = linksResult.ok ? linksResult.value : [];
  if (!linksResult.ok) {
    errors.links = linksResult.error;
  }

  const avatarUrl = normalizeBucketUrl(raw.avatarUrl);
  if (typeof raw.avatarUrl === "string" && raw.avatarUrl.trim().length && avatarUrl === null) {
    errors.avatarUrl = "That avatar image is not a profile-media upload.";
  }
  const coverUrl = normalizeBucketUrl(raw.coverUrl);
  if (typeof raw.coverUrl === "string" && raw.coverUrl.trim().length && coverUrl === null) {
    errors.coverUrl = "That cover image is not a profile-media upload.";
  }
  const pinnedCollectionSlugs = normalizePinnedSlugs(raw.pinnedCollectionSlugs);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { handle, displayName, bio, location, links, avatarUrl, coverUrl, pinnedCollectionSlugs },
  };
}
