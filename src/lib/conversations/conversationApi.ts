/**
 * HTTP handlers for the conversation layer (Phase 3): likes, reposts, replies.
 *
 * The shape is the follow endpoints', deliberately: thin route → handler →
 * injected store, `Cache-Control: private, no-store`, 401 special-cased so a
 * client button can render a sign-in prompt.
 *
 * The one rule specific to this layer: a CREATE (like, repost, reply) first
 * resolves the target and checks actorCanReachTarget() — you cannot endorse or
 * reply to something you were never allowed to see, and blocking it here keeps
 * the row from existing at all. A REMOVE (unlike, unrepost, delete reply) skips
 * that gate: you can always retract your own row, even after the target's owner
 * has since restricted it.
 */

import {
  actorCanReachTarget,
  parseCreateReplyRequest,
  parseTargetRefRequest,
  parseUpdateReplyRequest,
  type TargetRef,
} from "./conversation.ts";
import {
  ParentReplyMismatchError,
  ReplyNotFoundError,
  TargetForbiddenError,
  TargetNotFoundError,
} from "./conversationErrors.ts";
import type { ConversationStore } from "./conversationStore.server.ts";

export interface ConversationApiDependencies {
  authenticate(): Promise<string | null>;
  store: ConversationStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function actor(dependencies: ConversationApiDependencies): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? errorResponse("Authentication required", 401);
}

async function jsonBody(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
}

/**
 * Resolve the target and confirm the actor may see it. Returns the validated
 * ref on success, or the Response to return on failure (404 / 403).
 */
async function gateTarget(
  dependencies: ConversationApiDependencies,
  actorId: string,
  ref: TargetRef,
): Promise<TargetRef | Response> {
  const target = await dependencies.store.resolveTarget(ref.targetType, ref.targetId);
  if (!target) return errorResponse("Target not found", 404);
  const follows =
    actorId === target.ownerId ? false : await dependencies.store.actorFollows(actorId, target.ownerId);
  if (!actorCanReachTarget(target, actorId, follows)) {
    return errorResponse("You cannot act on a target you cannot see", 403);
  }
  return ref;
}

function mapWriteError(cause: unknown): Response {
  if (cause instanceof TargetNotFoundError) return errorResponse("Target not found", 404);
  if (cause instanceof TargetForbiddenError) return errorResponse(cause.message, 403);
  if (cause instanceof ParentReplyMismatchError) return errorResponse(cause.message, 422);
  if (cause instanceof ReplyNotFoundError) return errorResponse("Reply not found", 404);
  return errorResponse("The request could not be completed", 503);
}

// ── likes ──────────────────────────────────────────────────────────────────

/** POST /api/likes — body `{ targetType, targetId }`. Idempotent; 204. */
export async function handleLike(request: Request, dependencies: ConversationApiDependencies): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseTargetRefRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);

  const gated = await gateTarget(dependencies, actorId, parsed.value);
  if (gated instanceof Response) return gated;
  try {
    await dependencies.store.like(actorId, gated);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

/** DELETE /api/likes — body `{ targetType, targetId }`. Idempotent; 204. */
export async function handleUnlike(request: Request, dependencies: ConversationApiDependencies): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseTargetRefRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    await dependencies.store.unlike(actorId, parsed.value);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

// ── reposts ────────────────────────────────────────────────────────────────

/** POST /api/reposts — body `{ targetType, targetId }`. 201 `{ repostId, createdAt, created }`. */
export async function handleRepost(request: Request, dependencies: ConversationApiDependencies): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseTargetRefRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);

  const gated = await gateTarget(dependencies, actorId, parsed.value);
  if (gated instanceof Response) return gated;
  try {
    const repost = await dependencies.store.repost(actorId, gated);
    return Response.json(repost, { status: 201, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

/** DELETE /api/reposts — body `{ targetType, targetId }`. Idempotent; 204. */
export async function handleUnrepost(request: Request, dependencies: ConversationApiDependencies): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseTargetRefRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    await dependencies.store.unrepost(actorId, parsed.value);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

// ── replies ────────────────────────────────────────────────────────────────

/** POST /api/replies — body `{ targetType, targetId, parentId?, body }`. 201. */
export async function handleCreateReply(
  request: Request,
  dependencies: ConversationApiDependencies,
): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseCreateReplyRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);

  const gated = await gateTarget(dependencies, actorId, parsed.value);
  if (gated instanceof Response) return gated;
  try {
    const reply = await dependencies.store.createReply(actorId, parsed.value);
    return Response.json(reply, { status: 201, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

/** PATCH /api/replies/[replyId] — body `{ body }`. Author-scoped; 204. */
export async function handleUpdateReply(
  replyId: string,
  request: Request,
  dependencies: ConversationApiDependencies,
): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseUpdateReplyRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    await dependencies.store.updateReply(actorId, replyId, parsed.value.body);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}

/** DELETE /api/replies/[replyId]. Author-scoped, cascades to children; 204. */
export async function handleDeleteReply(
  replyId: string,
  dependencies: ConversationApiDependencies,
): Promise<Response> {
  const actorId = await actor(dependencies);
  if (actorId instanceof Response) return actorId;
  try {
    await dependencies.store.deleteReply(actorId, replyId);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapWriteError(cause);
  }
}
