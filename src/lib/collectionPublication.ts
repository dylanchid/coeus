import { slugifyId } from "./sources.ts";
import type { ArchiveCollection, ArchiveItem } from "./archiveTypes.ts";

export type PublicationVisibility = "unlisted" | "public";

export interface CollectionPublicationItem {
  itemLocalId: string;
  position: number;
  title: string;
  url: string;
  sourceName: string;
  author: string;
  excerpt: string;
  curatorComment: string;
}

/** The public-safe payload a publish request sends and a stored publication carries. */
export interface CollectionPublicationSnapshot {
  collectionLocalId: string;
  slug: string;
  visibility: PublicationVisibility;
  name: string;
  description: string;
  curatorNote: string;
  attribution: string;
  items: CollectionPublicationItem[];
}

/** A publication as persisted, once it has a durable identity. */
export interface CollectionPublication extends CollectionPublicationSnapshot {
  id: string;
  archiveId: string;
  publishedAt: string;
  updatedAt: string;
  unpublishedAt: string | null;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 96;
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;
const MAX_EXCERPT_LENGTH = 2000;
const MAX_ITEMS = 500;

export function isValidSlug(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length >= MIN_SLUG_LENGTH &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

/**
 * Propose a base slug from a collection's name. Callers must still resolve
 * collisions: publish_collection() enforces a global unique constraint, and
 * only the first publish of a collection assigns a slug (it never changes on
 * republish), so retry with slugWithSuffix() only on that first publish.
 */
export function proposeSlug(name: string): string {
  const base = slugifyId(name).slice(0, MAX_SLUG_LENGTH);
  return base.length >= MIN_SLUG_LENGTH ? base : `${base || "collection"}-collection`;
}

/** Append a short, URL-safe disambiguator when a proposed slug collides. */
export function slugWithSuffix(base: string, disambiguator: string): string {
  const suffix = disambiguator.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "x";
  const trimmedBase = base.slice(0, MAX_SLUG_LENGTH - suffix.length - 1) || "collection";
  return `${trimmedBase}-${suffix}`;
}

export interface DerivePublicationOptions {
  visibility: PublicationVisibility;
  slug: string;
  curatorNote?: string;
  attribution?: string;
  /** Per-item public commentary, keyed by ArchiveItem.id. Never derived from the private item.note. */
  curatorComments?: Record<string, string>;
}

/**
 * Derive the public-safe snapshot to publish for a collection. Only fields
 * meant to be public ever cross this boundary: item.note, item.tags,
 * item.state, item.starred, item.topic, item.savedAt, and item.articleId are
 * intentionally left out.
 */
export function derivePublicationSnapshot(
  collection: ArchiveCollection,
  items: readonly ArchiveItem[],
  options: DerivePublicationOptions
): CollectionPublicationSnapshot {
  const included = items.filter((item) => item.collectionIds.includes(collection.id));
  return {
    collectionLocalId: collection.id,
    slug: options.slug,
    visibility: options.visibility,
    name: collection.name.trim().slice(0, MAX_NAME_LENGTH),
    description: collection.description.trim().slice(0, MAX_TEXT_LENGTH),
    curatorNote: (options.curatorNote ?? "").trim().slice(0, MAX_TEXT_LENGTH),
    attribution: (options.attribution ?? "").trim().slice(0, MAX_TEXT_LENGTH),
    items: included.map((item, index) => ({
      itemLocalId: item.id,
      position: index,
      title: item.title,
      url: item.url,
      sourceName: item.sourceName,
      author: item.author,
      excerpt: item.summary.slice(0, MAX_EXCERPT_LENGTH),
      curatorComment: (options.curatorComments?.[item.id] ?? "").trim().slice(0, MAX_TEXT_LENGTH),
    })),
  };
}

export type PublicationParseResult =
  | { ok: true; value: CollectionPublicationSnapshot }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseItem(value: unknown, index: number): { ok: true; value: CollectionPublicationItem } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: `Item ${index} must be an object` };
  if (!isNonEmptyString(value.itemLocalId, 160)) return { ok: false, error: `Item ${index} has an invalid itemLocalId` };
  if (typeof value.position !== "number" || !Number.isInteger(value.position) || value.position < 0) {
    return { ok: false, error: `Item ${index} has an invalid position` };
  }
  if (!isNonEmptyString(value.title, 500)) return { ok: false, error: `Item ${index} has an invalid title` };
  if (!isHttpUrl(value.url)) return { ok: false, error: `Item ${index} has an invalid url` };
  if (!isBoundedString(value.sourceName, 200)) return { ok: false, error: `Item ${index} has an invalid sourceName` };
  if (!isBoundedString(value.author, 200)) return { ok: false, error: `Item ${index} has an invalid author` };
  if (!isBoundedString(value.excerpt, MAX_EXCERPT_LENGTH)) return { ok: false, error: `Item ${index} has an invalid excerpt` };
  if (!isBoundedString(value.curatorComment, MAX_TEXT_LENGTH)) return { ok: false, error: `Item ${index} has an invalid curatorComment` };
  return {
    ok: true,
    value: {
      itemLocalId: value.itemLocalId,
      position: value.position,
      title: value.title,
      url: value.url,
      sourceName: value.sourceName,
      author: value.author,
      excerpt: value.excerpt,
      curatorComment: value.curatorComment,
    },
  };
}

/** Runtime validation for the payload a publish/republish API request carries. */
export function parsePublicationSnapshot(raw: unknown): PublicationParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Publication must be a JSON object" };
  const allowed = new Set([
    "collectionLocalId", "slug", "visibility", "name", "description",
    "curatorNote", "attribution", "items",
  ]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown publication field: ${unknownField}` };
  if (!isNonEmptyString(raw.collectionLocalId, 160)) return { ok: false, error: "collectionLocalId must be a non-empty string" };
  if (!isValidSlug(raw.slug as string)) return { ok: false, error: "slug is invalid" };
  if (raw.visibility !== "unlisted" && raw.visibility !== "public") return { ok: false, error: "visibility must be 'unlisted' or 'public'" };
  if (!isNonEmptyString(raw.name, MAX_NAME_LENGTH)) return { ok: false, error: "name must be a non-empty string" };
  if (!isBoundedString(raw.description, MAX_TEXT_LENGTH)) return { ok: false, error: "description is invalid" };
  if (!isBoundedString(raw.curatorNote, MAX_TEXT_LENGTH)) return { ok: false, error: "curatorNote is invalid" };
  if (!isBoundedString(raw.attribution, MAX_TEXT_LENGTH)) return { ok: false, error: "attribution is invalid" };
  if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) return { ok: false, error: `items must be an array of at most ${MAX_ITEMS} entries` };

  const items: CollectionPublicationItem[] = [];
  const seenIds = new Set<string>();
  for (const [index, candidate] of raw.items.entries()) {
    const parsed = parseItem(candidate, index);
    if (!parsed.ok) return parsed;
    if (seenIds.has(parsed.value.itemLocalId)) return { ok: false, error: `Item ${index} has a duplicate itemLocalId` };
    seenIds.add(parsed.value.itemLocalId);
    items.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      collectionLocalId: raw.collectionLocalId,
      slug: raw.slug,
      visibility: raw.visibility,
      name: raw.name,
      description: raw.description,
      curatorNote: raw.curatorNote,
      attribution: raw.attribution,
      items,
    } as unknown as CollectionPublicationSnapshot,
  };
}

/** What a client sends to publish or republish a collection; the server derives the rest from its own archive data. */
export interface PublishCollectionRequest {
  collectionLocalId: string;
  visibility: PublicationVisibility;
  curatorNote: string;
  attribution: string;
}

export type PublishRequestParseResult =
  | { ok: true; value: PublishCollectionRequest }
  | { ok: false; error: string };

export function parsePublishRequest(raw: unknown): PublishRequestParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const allowed = new Set(["collectionLocalId", "visibility", "curatorNote", "attribution"]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isNonEmptyString(raw.collectionLocalId, 160)) return { ok: false, error: "collectionLocalId must be a non-empty string" };
  if (raw.visibility !== "unlisted" && raw.visibility !== "public") return { ok: false, error: "visibility must be 'unlisted' or 'public'" };
  const curatorNote = raw.curatorNote === undefined ? "" : raw.curatorNote;
  const attribution = raw.attribution === undefined ? "" : raw.attribution;
  if (!isBoundedString(curatorNote, MAX_TEXT_LENGTH)) return { ok: false, error: "curatorNote is invalid" };
  if (!isBoundedString(attribution, MAX_TEXT_LENGTH)) return { ok: false, error: "attribution is invalid" };
  return {
    ok: true,
    value: { collectionLocalId: raw.collectionLocalId, visibility: raw.visibility, curatorNote, attribution },
  };
}

export interface UnpublishCollectionRequest {
  collectionLocalId: string;
}

export type UnpublishRequestParseResult =
  | { ok: true; value: UnpublishCollectionRequest }
  | { ok: false; error: string };

export function parseUnpublishRequest(raw: unknown): UnpublishRequestParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const unknownField = Object.keys(raw).find((key) => key !== "collectionLocalId");
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isNonEmptyString(raw.collectionLocalId, 160)) return { ok: false, error: "collectionLocalId must be a non-empty string" };
  return { ok: true, value: { collectionLocalId: raw.collectionLocalId } };
}
