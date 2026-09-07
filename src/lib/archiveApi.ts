import {
  ArchiveBudgetError,
  ArchiveCommitContentionError,
  ArchiveNotFoundError,
  ArchiveRateLimitError,
  ArchiveRevisionAheadError,
  type ArchiveSyncStore,
} from "./archiveSyncStore.server.ts";
import { parseArchiveSyncBatch } from "./archiveSync.ts";

const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024;

export interface ArchiveApiDependencies {
  authenticate(): Promise<string | null>;
  store: ArchiveSyncStore;
}

function responseHeaders(revision?: number): HeadersInit {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    ...(revision === undefined ? {} : { ETag: `"revision-${revision}"` }),
  };
}

function errorResponse(error: string, status: number, details?: unknown): Response {
  return Response.json({ error, ...(details === undefined ? {} : { details }) }, {
    status,
    headers: responseHeaders(),
  });
}

export async function handleArchiveGet(dependencies: ArchiveApiDependencies): Promise<Response> {
  const ownerId = await dependencies.authenticate();
  if (!ownerId) return errorResponse("Authentication required", 401);
  try {
    const archive = await dependencies.store.getOrCreate(ownerId);
    return Response.json(archive, { headers: responseHeaders(archive.snapshot.revision) });
  } catch {
    return errorResponse("Archive storage is unavailable", 503);
  }
}

export async function handleArchiveSync(
  request: Request,
  dependencies: ArchiveApiDependencies
): Promise<Response> {
  const ownerId = await dependencies.authenticate();
  if (!ownerId) return errorResponse("Authentication required", 401);

  let budget;
  try {
    budget = await dependencies.store.consumeSyncBudget(ownerId);
  } catch {
    return errorResponse("Archive storage is unavailable", 503);
  }
  if (!budget.allowed) {
    return Response.json({ error: "Sync rate limit exceeded", retryAfterSeconds: budget.retryAfterSeconds }, {
      status: 429,
      headers: { ...responseHeaders(), "Retry-After": String(budget.retryAfterSeconds) },
    });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SYNC_BODY_BYTES) return errorResponse("Sync batch is too large", 413);

  let raw: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_SYNC_BODY_BYTES) {
      return errorResponse("Sync batch is too large", 413);
    }
    raw = JSON.parse(text);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }

  const parsed = parseArchiveSyncBatch(raw);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  try {
    const result = await dependencies.store.sync(ownerId, parsed.value);
    return Response.json(result, { headers: responseHeaders(result.snapshot.revision) });
  } catch (error) {
    if (error instanceof ArchiveNotFoundError) return errorResponse("Archive not found", 404);
    if (error instanceof ArchiveRevisionAheadError) {
      return errorResponse("baseRevision is ahead of the server", 409, error.current);
    }
    if (error instanceof ArchiveCommitContentionError) {
      return errorResponse("Archive changed; retry the batch", 409);
    }
    if (error instanceof ArchiveRateLimitError) {
      return Response.json({ error: "Sync rate limit exceeded", retryAfterSeconds: error.retryAfterSeconds }, {
        status: 429,
        headers: { ...responseHeaders(), "Retry-After": String(error.retryAfterSeconds) },
      });
    }
    if (error instanceof ArchiveBudgetError) {
      return Response.json({ error: error.message, budget: error.violation }, { status: 413, headers: responseHeaders() });
    }
    return errorResponse("Archive synchronization failed", 503);
  }
}
