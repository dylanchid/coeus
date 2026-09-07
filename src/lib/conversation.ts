/**
 * Pure request parsing and the write-time visibility gate for the conversation
 * layer (Phase 3): likes, reposts, replies.
 *
 * Every write validates the actor CAN SEE the target first — you cannot like,
 * repost or reply to something you were never allowed to see. Enforcing that at
 * write time stops the row existing at all, rather than relying on read-time
 * filtering to hide it. That gate is {@link actorCanReachTarget}, built on
 * canSee() from visibility.ts — the one security boundary, reused, never
 * re-implemented.
 *
 * No "server-only", no Supabase, no Next import: exhaustively testable under
 * `node --test` with no database.
 */

import { canSee, type Viewer, type Visibility } from "./visibility.ts";

/** What a like / repost / reply points at. Mirrors the `public.target_type` enum. */
export type TargetType = "collection" | "post";

export const TARGET_TYPES: readonly TargetType[] = ["collection", "post"];

export function isTargetType(value: unknown): value is TargetType {
  return typeof value === "string" && (TARGET_TYPES as readonly string[]).includes(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPLY_BODY_LENGTH = 4000;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReplyBody(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.length <= MAX_REPLY_BODY_LENGTH;
}

/**
 * The current state of a like / repost / reply target, resolved from the live
 * `collection_publications` or `posts` row. `ownerId` is the target owner — a
 * different person from the actor — and the relationship that governs the gate.
 */
export interface ResolvedTarget {
  targetType: TargetType;
  targetId: string;
  visibility: Visibility;
  ownerId: string;
}

/**
 * May this actor act on this target? The write-time analogue of a read-time
 * canSee(): resolve the actor as a viewer TOWARD THE TARGET OWNER, then defer
 * to canSee. `unlisted` passes — you can like a collection you were handed the
 * link to — exactly as canSee allows.
 */
export function actorCanReachTarget(
  target: Pick<ResolvedTarget, "visibility" | "ownerId">,
  actorId: string,
  actorFollowsOwner: boolean,
): boolean {
  const viewer: Viewer =
    actorId === target.ownerId
      ? { kind: "owner", id: actorId }
      : actorFollowsOwner
        ? { kind: "follower", id: actorId }
        : { kind: "signed-in", id: actorId };
  return canSee(target.visibility, viewer);
}

// ── request parsers ────────────────────────────────────────────────────────

export interface TargetRef {
  targetType: TargetType;
  targetId: string;
}

export interface CreateReplyRequest extends TargetRef {
  parentId: string | null;
  body: string;
}

export interface UpdateReplyRequest {
  body: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseTargetRef(raw: unknown, allowedKeys: readonly string[]): ParseResult<TargetRef> {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const unknownField = Object.keys(raw).find((key) => !allowedKeys.includes(key));
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isTargetType(raw.targetType)) return { ok: false, error: "targetType must be 'collection' or 'post'" };
  if (!isUuid(raw.targetId)) return { ok: false, error: "targetId must be a UUID" };
  return { ok: true, value: { targetType: raw.targetType, targetId: raw.targetId } };
}

/** POST / DELETE `/api/likes` and `/api/reposts` — body `{ targetType, targetId }`. */
export function parseTargetRefRequest(raw: unknown): ParseResult<TargetRef> {
  return parseTargetRef(raw, ["targetType", "targetId"]);
}

/** POST `/api/replies` — body `{ targetType, targetId, parentId?, body }`. */
export function parseCreateReplyRequest(raw: unknown): ParseResult<CreateReplyRequest> {
  const base = parseTargetRef(raw, ["targetType", "targetId", "parentId", "body"]);
  if (!base.ok) return base;
  const record = raw as Record<string, unknown>;
  const parentId = record.parentId ?? null;
  if (parentId !== null && !isUuid(parentId)) {
    return { ok: false, error: "parentId must be a UUID or null" };
  }
  if (!isReplyBody(record.body)) {
    return { ok: false, error: `body must be 1–${MAX_REPLY_BODY_LENGTH} characters` };
  }
  return { ok: true, value: { ...base.value, parentId: parentId as string | null, body: record.body as string } };
}

/** PATCH `/api/replies/[id]` — body `{ body }`. */
export function parseUpdateReplyRequest(raw: unknown): ParseResult<UpdateReplyRequest> {
  if (!isRecord(raw)) return { ok: false, error: "Request body must be a JSON object" };
  const unknownField = Object.keys(raw).find((key) => key !== "body");
  if (unknownField) return { ok: false, error: `Unknown field: ${unknownField}` };
  if (!isReplyBody(raw.body)) {
    return { ok: false, error: `body must be 1–${MAX_REPLY_BODY_LENGTH} characters` };
  }
  return { ok: true, value: { body: raw.body } };
}
