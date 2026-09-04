import { parsePublishRequest, parseUnpublishRequest } from "./collectionPublication.ts";
import { CollectionNotFoundError, type CollectionPublicationStore } from "./collectionPublicationStore.server.ts";

export interface CollectionPublicationApiDependencies {
  authenticate(): Promise<string | null>;
  store: CollectionPublicationStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function owner(dependencies: CollectionPublicationApiDependencies): Promise<string | Response> {
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
