import type { ArchiveExport } from "./archiveRecovery.ts";
import type { ArchiveRecoveryStore } from "./archiveRecoveryStore.server.ts";

export interface ArchiveRecoveryApiDependencies {
  authenticate(): Promise<string | null>;
  store: ArchiveRecoveryStore;
}

function headers(): HeadersInit { return { "Cache-Control": "private, no-store, max-age=0" }; }
function error(message: string, status: number): Response { return Response.json({ error: message }, { status, headers: headers() }); }

async function owner(dependencies: ArchiveRecoveryApiDependencies): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? error("Authentication required", 401);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function handleArchiveExport(dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  try {
    const archive = await dependencies.store.export(userId);
    const body: ArchiveExport = { format: "coeus.archive.export.v1", exportedAt: new Date().toISOString(), ...archive };
    return Response.json(body, { headers: { ...headers(), "Content-Disposition": 'attachment; filename="coeus-archive.json"' } });
  } catch { return error("Archive export is unavailable", 503); }
}

export async function handleArchiveRevisions(dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  try {
    const archive = await dependencies.store.export(userId);
    return Response.json({ archiveId: archive.archiveId, currentRevision: archive.current.revision, revisions: archive.revisions }, { headers: headers() });
  } catch { return error("Archive revisions are unavailable", 503); }
}

export async function handleArchiveRestore(request: Request, dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  let body: unknown;
  try { body = await request.json(); } catch { return error("Request body must be valid JSON", 400); }
  const revision = body && typeof body === "object" ? (body as { revision?: unknown }).revision : undefined;
  if (!nonNegativeInteger(revision)) return error("revision must be a non-negative integer", 400);
  try { return Response.json(await dependencies.store.restore(userId, revision), { headers: headers() }); }
  catch (cause) { return error(cause instanceof Error && cause.message === "Revision not found" ? cause.message : "Archive recovery failed", cause instanceof Error && cause.message === "Revision not found" ? 404 : 409); }
}

export async function handleContentCapture(request: Request, dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  let body: unknown;
  try { body = await request.json(); } catch { return error("Request body must be valid JSON", 400); }
  const itemId = body && typeof body === "object" ? (body as { itemId?: unknown }).itemId : undefined;
  if (typeof itemId !== "string" || !itemId || itemId.length > 160) return error("itemId must be a non-empty string", 400);
  try { return Response.json(await dependencies.store.capture(userId, itemId), { status: 201, headers: headers() }); }
  catch (cause) { return error(cause instanceof Error && cause.message === "Archive item not found" ? cause.message : "Content capture failed", cause instanceof Error && cause.message === "Archive item not found" ? 404 : 422); }
}

export async function handleContentDownload(snapshotId: string, dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  try {
    const content = await dependencies.store.content(userId, snapshotId);
    return new Response(content.body, { headers: { ...headers(), "Content-Type": content.mediaType, "Content-Disposition": `attachment; filename="${content.filename}"` } });
  } catch { return error("Captured content not found", 404); }
}

export async function handleAccountDelete(request: Request, dependencies: ArchiveRecoveryApiDependencies): Promise<Response> {
  const userId = await owner(dependencies); if (userId instanceof Response) return userId;
  let body: unknown;
  try { body = await request.json(); } catch { return error("Request body must be valid JSON", 400); }
  if (!body || typeof body !== "object" || (body as { confirmation?: unknown }).confirmation !== "DELETE") return error('Set confirmation to "DELETE" to delete your cloud account', 400);
  try { await dependencies.store.deleteAccount(userId); return new Response(null, { status: 204, headers: headers() }); }
  catch { return error("Account deletion failed", 503); }
}
