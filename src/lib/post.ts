import type { ArchiveItem } from "./archiveTypes.ts";
import { isPublicationVisibility, type PublicationVisibility } from "./collectionPublication.ts";

/**
 * The publish boundary for a single post — the same contract
 * derivePublicationSnapshot() provides for collection items, and the reason a
 * post can safely leave the private archive.
 *
 * A post is one sourced clip: a URL with optional commentary. `derivePostSnapshot`
 * takes an ArchiveItem plus the owner's explicit choices and returns ONLY the
 * fields that may be published. The private fields on ArchiveItem — note, tags,
 * state, starred, topic, savedAt, articleId — are intentionally left out, exactly
 * as they never cross derivePublicationSnapshot().
 *
 * Pure by contract: no "server-only", no Supabase, no Next import, so the
 * boundary is exhaustively testable under `node --test` with no database.
 */

const MAX_TITLE_LENGTH = 500;
const MAX_SHORT_TEXT_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 2000;
const MAX_COMMENTARY_LENGTH = 4000;
const MAX_ITEM_LOCAL_ID_LENGTH = 160;

/** The public-safe payload a publish request carries and a stored post mirrors. */
export interface PostSnapshot {
  itemLocalId: string;
  title: string;
  url: string;
  sourceName: string;
  author: string;
  excerpt: string;
  commentary: string;
  visibility: PublicationVisibility;
}

export interface DerivePostOptions {
  visibility: PublicationVisibility;
  /**
   * The post's public commentary, supplied by the publisher. NEVER derived
   * from the private item.note — item.note is the private annotation and must
   * never be published, the same distinction derivePublicationSnapshot() draws
   * for curatorComments.
   */
  commentary?: string;
}

/**
 * Derive the public-safe snapshot to publish for one archive item. Only fields
 * meant to be public ever cross this boundary: item.note, item.tags,
 * item.state, item.starred, item.topic, item.savedAt, and item.articleId are
 * intentionally left out.
 */
export function derivePostSnapshot(item: ArchiveItem, options: DerivePostOptions): PostSnapshot {
  return {
    itemLocalId: item.id,
    title: item.title,
    url: item.url,
    sourceName: item.sourceName,
    author: item.author,
    excerpt: item.summary.slice(0, MAX_EXCERPT_LENGTH),
    // From options, never from item.note.
    commentary: (options.commentary ?? "").trim().slice(0, MAX_COMMENTARY_LENGTH),
    visibility: options.visibility,
  };
}

export type PostParseResult = { ok: true; value: PostSnapshot } | { ok: false; error: string };

// The same three helpers collectionPublication.ts uses. Duplicated rather than
// exported-and-imported to keep that module's surface small; the pattern is
// deliberately identical so there is no third validation style.
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

/** Runtime validation for the payload a publish/republish API request carries. */
export function parsePostSnapshot(raw: unknown): PostParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Post must be a JSON object" };
  const allowed = new Set([
    "itemLocalId", "title", "url", "sourceName", "author", "excerpt", "commentary", "visibility",
  ]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown post field: ${unknownField}` };
  if (!isNonEmptyString(raw.itemLocalId, MAX_ITEM_LOCAL_ID_LENGTH)) {
    return { ok: false, error: "itemLocalId must be a non-empty string" };
  }
  if (!isNonEmptyString(raw.title, MAX_TITLE_LENGTH)) return { ok: false, error: "title must be a non-empty string" };
  if (!isHttpUrl(raw.url)) return { ok: false, error: "url must be an http(s) URL" };
  if (!isBoundedString(raw.sourceName, MAX_SHORT_TEXT_LENGTH)) return { ok: false, error: "sourceName is invalid" };
  if (!isBoundedString(raw.author, MAX_SHORT_TEXT_LENGTH)) return { ok: false, error: "author is invalid" };
  if (!isBoundedString(raw.excerpt, MAX_EXCERPT_LENGTH)) return { ok: false, error: "excerpt is invalid" };
  if (!isBoundedString(raw.commentary, MAX_COMMENTARY_LENGTH)) return { ok: false, error: "commentary is invalid" };
  if (!isPublicationVisibility(raw.visibility)) {
    return { ok: false, error: "visibility must be 'private', 'followers', 'unlisted', or 'public'" };
  }
  return {
    ok: true,
    value: {
      itemLocalId: raw.itemLocalId,
      title: raw.title,
      url: raw.url,
      sourceName: raw.sourceName,
      author: raw.author,
      excerpt: raw.excerpt,
      commentary: raw.commentary,
      visibility: raw.visibility,
    },
  };
}

/**
 * What a client sends to publish or republish a post. The server derives the
 * public-safe snapshot from its own archive data — the client never sends
 * title/url/excerpt — exactly how PublishCollectionRequest works.
 */
export interface PublishPostRequest {
  itemLocalId: string;
  visibility: PublicationVisibility;
  commentary: string;
}

export type PublishPostRequestParseResult =
  | { ok: true; value: PublishPostRequest }
  | { ok: false; error: string };

export function parsePublishPostRequest(raw: unknown): PublishPostRequestParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const allowed = new Set(["itemLocalId", "visibility", "commentary"]);
  const unknownField = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isNonEmptyString(raw.itemLocalId, MAX_ITEM_LOCAL_ID_LENGTH)) {
    return { ok: false, error: "itemLocalId must be a non-empty string" };
  }
  if (!isPublicationVisibility(raw.visibility)) {
    return { ok: false, error: "visibility must be 'private', 'followers', 'unlisted', or 'public'" };
  }
  const commentary = raw.commentary === undefined ? "" : raw.commentary;
  if (!isBoundedString(commentary, MAX_COMMENTARY_LENGTH)) return { ok: false, error: "commentary is invalid" };
  return { ok: true, value: { itemLocalId: raw.itemLocalId, visibility: raw.visibility, commentary } };
}

export interface UnpublishPostRequest {
  itemLocalId: string;
}

export type UnpublishPostRequestParseResult =
  | { ok: true; value: UnpublishPostRequest }
  | { ok: false; error: string };

export function parseUnpublishPostRequest(raw: unknown): UnpublishPostRequestParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const unknownField = Object.keys(raw).find((key) => key !== "itemLocalId");
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isNonEmptyString(raw.itemLocalId, MAX_ITEM_LOCAL_ID_LENGTH)) {
    return { ok: false, error: "itemLocalId must be a non-empty string" };
  }
  return { ok: true, value: { itemLocalId: raw.itemLocalId } };
}

/** A post as persisted, once it has a durable identity. */
export interface Post extends PostSnapshot {
  id: string;
  createdAt: string;
  updatedAt: string;
}
