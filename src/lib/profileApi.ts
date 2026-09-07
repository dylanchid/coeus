import { validateProfileInput } from "./profile.ts";
import { HandleTakenError } from "./profileErrors.ts";
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

/** PUT /api/account/profile — create or update the caller's profile. 409 with `field: "handle"` when the handle is taken. */
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
