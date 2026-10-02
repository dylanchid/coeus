import { catalogSourceIds } from "./sources.ts";
import { parseRatingWrite } from "./sourceRatings.ts";
import type { SourceRatingsStore } from "./sourceRatingsStore.server.ts";

export interface SourceRatingsApiDependencies {
  /** Resolves the signed-in user id, or null for an anonymous caller. */
  authenticate(): Promise<string | null>;
  store: SourceRatingsStore;
}

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

/** Anyone may read the histogram; a signed-in caller also gets their own rating. */
export async function handleGetSourceRatings(request: Request, dependencies: SourceRatingsApiDependencies): Promise<Response> {
  const sourceId = new URL(request.url).searchParams.get("id") ?? "";
  if (!catalogSourceIds().includes(sourceId)) return error("Unknown source", 400);
  try {
    const userId = await dependencies.authenticate();
    const [summary, mine] = await Promise.all([
      dependencies.store.summary(sourceId),
      userId ? dependencies.store.mine(userId, sourceId) : Promise.resolve(null),
    ]);
    return Response.json({ ...summary, mine, signedIn: Boolean(userId) }, { headers: NO_STORE });
  } catch {
    return error("Ratings are unavailable", 503);
  }
}

export async function handlePutSourceRating(request: Request, dependencies: SourceRatingsApiDependencies): Promise<Response> {
  const userId = await dependencies.authenticate();
  if (!userId) return error("Authentication required", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON", 400);
  }
  const parsed = parseRatingWrite(body);
  if (!parsed.ok) return error(parsed.error, 400);
  try {
    await dependencies.store.set(userId, parsed.value.sourceId, parsed.value.halfSteps);
    const summary = await dependencies.store.summary(parsed.value.sourceId);
    return Response.json({ ...summary, mine: parsed.value.halfSteps / 2, signedIn: true }, { headers: NO_STORE });
  } catch {
    return error("Saving your rating failed", 503);
  }
}
