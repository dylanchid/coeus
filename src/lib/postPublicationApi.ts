import { parsePublishPostRequest, parseUnpublishPostRequest } from "./post.ts";
import { PostItemNotFoundError } from "./postErrors.ts";
import type { PostPublicationStore, PublicPostReader } from "./postPublicationStore.server.ts";

export interface PostPublicationApiDependencies {
  authenticate(): Promise<string | null>;
  store: PostPublicationStore;
}

export interface PostListApiDependencies {
  authenticate(): Promise<string | null>;
  store: PublicPostReader;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function owner(dependencies: { authenticate(): Promise<string | null> }): Promise<string | Response> {
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

/** GET /api/posts — the caller's own published posts, all tiers, so the archive
 * UI can show which items are published and at what visibility. */
export async function handleListPosts(dependencies: PostListApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ posts: await dependencies.store.listByAuthor(userId) }, { headers: headers() });
  } catch {
    return errorResponse("Posts are unavailable", 503);
  }
}

/** POST /api/posts/publish — body `{ itemLocalId, visibility, commentary }`. The
 * server derives the public-safe post from its own archive data. */
export async function handlePublishPost(
  request: Request,
  dependencies: PostPublicationApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parsePublishPostRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const post = await dependencies.store.publish(userId, parsed.value);
    return Response.json(post, { status: 201, headers: headers() });
  } catch (cause) {
    // An item the caller does not own is a 404, never a 500.
    if (cause instanceof PostItemNotFoundError) return errorResponse(cause.message, 404);
    return errorResponse("Publishing this post failed", 503);
  }
}

/** POST /api/posts/unpublish — body `{ itemLocalId }`. Idempotent: 404 only when
 * nothing was published for that item. */
export async function handleUnpublishPost(
  request: Request,
  dependencies: PostPublicationApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(request);
  if (body instanceof Response) return body;
  const parsed = parseUnpublishPostRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const unpublished = await dependencies.store.unpublish(userId, parsed.value.itemLocalId);
    if (!unpublished) return errorResponse("Post is not currently published", 404);
    return new Response(null, { status: 204, headers: headers() });
  } catch {
    return errorResponse("Unpublishing this post failed", 503);
  }
}
