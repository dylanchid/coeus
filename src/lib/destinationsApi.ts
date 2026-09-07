import { parseNotionConfig, parseObsidianGitConfig, type DestinationKind } from "./destinations.ts";
import { ArchiveNotFoundError, DestinationNotFoundError } from "./destinationsErrors.ts";
import type { DestinationsStore } from "./destinationsStore.server.ts";

export interface DestinationsApiDependencies {
  authenticate(): Promise<string | null>;
  store: DestinationsStore;
}

export interface DestinationsSyncApiDependencies {
  authenticate(): Promise<string | null>;
  /**
   * Runs one delivery pass for this owner's destination of the given kind and
   * returns a redaction-safe summary (counts, status, correlation id) for the
   * response body. Must not throw for an ordinary delivery failure.
   */
  triggerSync(ownerId: string, kind: DestinationKind): Promise<Record<string, unknown>>;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function owner(dependencies: { authenticate(): Promise<string | null> }): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? error("Authentication required", 401);
}

/** The URL path segment naming a destination is its kind: each archive has at most one destination per kind. */
export function parseDestinationKind(value: string): DestinationKind | null {
  return value === "obsidian_git" || value === "notion" ? value : null;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

interface ConnectRequest {
  kind: DestinationKind;
  displayName: string;
  config: unknown;
  secret: string;
}

function parseConnectRequest(raw: unknown): { ok: true; value: ConnectRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Request body must be a JSON object" };
  const body = raw as Record<string, unknown>;
  if (body.kind !== "obsidian_git" && body.kind !== "notion") {
    return { ok: false, error: "kind must be one of: obsidian_git, notion" };
  }
  if (!isNonEmptyString(body.displayName, 200)) return { ok: false, error: "displayName must be a non-empty string" };
  if (!isNonEmptyString(body.secret, 4000)) return { ok: false, error: "secret must be a non-empty string" };
  const config = body.kind === "obsidian_git" ? parseObsidianGitConfig(body.config) : parseNotionConfig(body.config);
  if (!config.ok) return { ok: false, error: config.error };
  return { ok: true, value: { kind: body.kind, displayName: body.displayName, config: config.value, secret: body.secret } };
}

function mapStoreError(cause: unknown): Response {
  if (cause instanceof ArchiveNotFoundError) return error("Archive not found", 404);
  if (cause instanceof DestinationNotFoundError) return error("Destination not found", 404);
  return error("Destinations are unavailable", 503);
}

export async function handleListDestinations(dependencies: DestinationsApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ destinations: await dependencies.store.list(userId) }, { headers: headers() });
  } catch (cause) {
    return mapStoreError(cause);
  }
}

export async function handleConnectDestination(request: Request, dependencies: DestinationsApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON", 400);
  }
  const parsed = parseConnectRequest(body);
  if (!parsed.ok) return error(parsed.error, 400);
  try {
    const destination = await dependencies.store.connect(
      userId,
      parsed.value.kind,
      parsed.value.displayName,
      parsed.value.config as never,
      parsed.value.secret
    );
    return Response.json(destination, { status: 201, headers: headers() });
  } catch (cause) {
    return mapStoreError(cause);
  }
}

/**
 * `?purge=1` permanently deletes the row (and its delivery history via
 * cascade); a plain DELETE only clears the secret and flips to "disabled",
 * keeping external_ref history so a later reconnect doesn't re-send
 * already-delivered items.
 */
export async function handleDisconnectDestination(kind: string, request: Request, dependencies: DestinationsApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  const parsedKind = parseDestinationKind(kind);
  if (!parsedKind) return error("Unknown destination kind", 404);
  const purge = new URL(request.url).searchParams.get("purge") === "1";
  try {
    const removed = purge
      ? await dependencies.store.purge(userId, parsedKind)
      : await dependencies.store.disconnect(userId, parsedKind);
    if (!removed) return error("Destination not found", 404);
    return new Response(null, { status: 204, headers: headers() });
  } catch (cause) {
    return mapStoreError(cause);
  }
}

export async function handleListDeliveries(kind: string, dependencies: DestinationsApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  const parsedKind = parseDestinationKind(kind);
  if (!parsedKind) return error("Unknown destination kind", 404);
  try {
    return Response.json({ deliveries: await dependencies.store.deliveries(userId, parsedKind) }, { headers: headers() });
  } catch (cause) {
    return mapStoreError(cause);
  }
}

export async function handleTriggerSync(kind: string, dependencies: DestinationsSyncApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  const parsedKind = parseDestinationKind(kind);
  if (!parsedKind) return error("Unknown destination kind", 404);
  try {
    const summary = await dependencies.triggerSync(userId, parsedKind);
    return Response.json(summary ?? {}, { status: 202, headers: headers() });
  } catch {
    return error("Triggering sync failed", 503);
  }
}
