import { validateProfileInput } from "./profile.ts";
import { HandleChangeRateLimitedError, HandleQuarantinedError, HandleTakenError } from "./profileErrors.ts";
import { parseProfileSectionsPatch } from "./profileSections.ts";
import type { ProfileStore } from "./profileStore.server.ts";

export interface ProfileApiDependencies {
  authenticate(): Promise<string | null>;
  store: ProfileStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function error(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error: message, ...extra }, { status, headers: headers() });
}

async function owner(dependencies: ProfileApiDependencies): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? error("Authentication required", 401);
}

/** GET /api/account/profile — `{ profile }`, with `profile: null` for a signed-in account that hasn't onboarded. */
export async function handleGetProfile(dependencies: ProfileApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ profile: await dependencies.store.get(userId) }, { headers: headers() });
  } catch {
    return error("Profiles are unavailable", 503);
  }
}

/**
 * PUT /api/account/profile — create or update the caller's profile.
 *   409 { field: "handle" } — the handle is taken, or was released by another
 *       account inside its 30-day quarantine (distinct message).
 *   429 { field: "handle", retryAt } — too many handle changes this year.
 */
export async function handleSaveProfile(request: Request, dependencies: ProfileApiDependencies): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON", 400);
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const validated = validateProfileInput({
    handle: raw.handle,
    displayName: raw.displayName,
    bio: raw.bio,
    location: raw.location,
    links: raw.links,
    avatarUrl: raw.avatarUrl,
    coverUrl: raw.coverUrl,
    pinnedCollectionSlugs: raw.pinnedCollectionSlugs,
  });
  if (!validated.ok) return error("Some fields need attention", 422, { fields: validated.errors });

  try {
    const profile = await dependencies.store.save(userId, validated.value);
    return Response.json({ profile }, { headers: headers() });
  } catch (cause) {
    if (cause instanceof HandleTakenError) {
      return error("That handle is already taken.", 409, { field: "handle" });
    }
    if (cause instanceof HandleQuarantinedError) {
      return error(
        "That handle was released by another account recently. It opens up 30 days after it was given up.",
        409,
        { field: "handle" }
      );
    }
    if (cause instanceof HandleChangeRateLimitedError) {
      const retryAfter = Math.max(1, Math.ceil((cause.nextChangeAllowedAt.getTime() - Date.now()) / 1000));
      return Response.json(
        {
          error: "You've changed your handle too many times this year.",
          field: "handle",
          retryAt: cause.nextChangeAllowedAt.toISOString(),
        },
        { status: 429, headers: { ...headers(), "Retry-After": String(retryAfter) } }
      );
    }
    return error("Saving your profile failed", 503);
  }
}

/**
 * PATCH /api/account/profile/sections — the five show_* switches and
 * likes_visibility, as a partial update. Separate from the profile PUT so
 * toggling one switch never re-sends the whole profile. An empty body is a
 * 400, not a no-op success. 404 when the caller has not onboarded.
 */
export async function handlePatchProfileSections(
  request: Request,
  dependencies: ProfileApiDependencies
): Promise<Response> {
  const userId = await owner(dependencies);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON", 400);
  }
  const parsed = parseProfileSectionsPatch(body);
  if (!parsed.ok) return error(parsed.error, 400);

  try {
    const sections = await dependencies.store.updateSections(userId, parsed.value);
    if (!sections) return error("Profile not found", 404);
    return Response.json({ sections }, { headers: headers() });
  } catch {
    return error("Saving your section settings failed", 503);
  }
}
