import { parseFollowRequest, parsePublishRequest, parseUnpublishRequest } from "./collectionPublication.ts";
import { CollectionForbiddenError, CollectionNotFoundError } from "./collectionPublicationErrors.ts";
import type {
  CollectionFollowStore,
  CollectionPublicationStore,
  PublicCollectionReader,
} from "./collectionPublicationStore.server.ts";

interface Authenticated {
  authenticate(): Promise<string | null>;
}

export interface CollectionPublicationApiDependencies extends Authenticated {
  store: CollectionPublicationStore;
}

export interface DiscoverCollectionsApiDependencies {
  store: PublicCollectionReader;
}

export interface CollectionFollowApiDependencies extends Authenticated {
  store: CollectionFollowStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function publicHeaders(): HeadersInit {
  return { "Cache-Control": "public, max-age=60" };
}

function errorResponse(message: string, status: number): Response {
  // Errors are never cached, even on otherwise-public endpoints like discovery.
  return Response.json({ error: message }, { status, headers: headers() });
}

async function owner(dependencies: Authenticated): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? errorResponse("Authentication required", 401);
}

export async function handleListPublications(dependencies: CollectionPublicationApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ publications: await dependencies.store.list(userId) }, { headers: headers() });
  } catch {
    return errorResponse("Publications are unavailable", 503);
  }
}

export async function handlePublishCollection(
  request: Request,
  dependencies: CollectionPublicationApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const parsed = parsePublishRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const publication = await dependencies.store.publish(userId, parsed.value);
    return Response.json(publication, { status: 201, headers: headers() });
  } catch (cause) {
    if (cause instanceof CollectionNotFoundError) return errorResponse(cause.message, 404);
    return errorResponse("Publishing this collection failed", 503);
  }
}

export async function handleUnpublishCollection(
  request: Request,
  dependencies: CollectionPublicationApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const parsed = parseUnpublishRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const unpublished = await dependencies.store.unpublish(userId, parsed.value.collectionLocalId);
    if (!unpublished) return errorResponse("Collection is not currently published", 404);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    if (cause instanceof CollectionNotFoundError) return errorResponse(cause.message, 404);
    return errorResponse("Unpublishing this collection failed", 503);
  }
}

const DEFAULT_DISCOVER_PAGE_SIZE = 20;

function positiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Unauthenticated: public (not unlisted, not private) collections only. */
export async function handleDiscoverCollections(
  request: Request,
  dependencies: DiscoverCollectionsApiDependencies
): Promise<Response> {
  const url = new URL(request.url);
  const limit = positiveInt(url.searchParams.get("limit"), DEFAULT_DISCOVER_PAGE_SIZE);
  const offset = positiveInt(url.searchParams.get("offset"), 0);
  try {
    const page = await dependencies.store.listPublic(limit || DEFAULT_DISCOVER_PAGE_SIZE, offset);
    return Response.json(page, { headers: publicHeaders() });
  } catch {
    return errorResponse("Discovery is unavailable", 503);
  }
}

export async function handleFollowCollection(
  request: Request,
  dependencies: CollectionFollowApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const parsed = parseFollowRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    await dependencies.store.follow(userId, parsed.value.publicationId);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    if (cause instanceof CollectionNotFoundError) return errorResponse("Collection not found", 404);
    if (cause instanceof CollectionForbiddenError) {
      return errorResponse("You cannot follow a collection you cannot see", 403);
    }
    return errorResponse("Following this collection failed", 503);
  }
}

export async function handleUnfollowCollection(
  request: Request,
  dependencies: CollectionFollowApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const parsed = parseFollowRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    await dependencies.store.unfollow(userId, parsed.value.publicationId);
    return new Response(null, { status: 204, headers: headers() });
  } catch {
    return errorResponse("Unfollowing this collection failed", 503);
  }
}

export async function handleListFollowed(dependencies: CollectionFollowApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ publications: await dependencies.store.listFollowed(userId) }, { headers: headers() });
  } catch {
    return errorResponse("Followed collections are unavailable", 503);
  }
}
