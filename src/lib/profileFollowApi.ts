import { parseProfileFollowRequest } from "./profileFollow.ts";
import type { ProfileFollowStore } from "./profileFollowStore.server.ts";

export interface ProfileFollowApiDependencies {
  authenticate(): Promise<string | null>;
  store: ProfileFollowStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function follower(dependencies: ProfileFollowApiDependencies): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  // Identical body shape to the collection follow endpoints: FollowButton.tsx
  // special-cases status 401 to render a sign-in prompt, and ProfileFollowButton
  // inherits that for free.
  return userId ?? errorResponse("Authentication required", 401);
}

async function parseBody(request: Request): Promise<{ profileId: string } | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const parsed = parseProfileFollowRequest(body);
  if (!parsed.ok) return errorResponse(parsed.error, 400);
  return parsed.value;
}

/** POST /api/profiles/follow — body `{ profileId }`. Idempotent; 422 on a self-follow. */
export async function handleFollowProfile(
  request: Request,
  dependencies: ProfileFollowApiDependencies
): Promise<Response> {
  const followerId = await follower(dependencies);
  if (followerId instanceof Response) return followerId;
  const body = await parseBody(request);
  if (body instanceof Response) return body;

  // Reject a self-follow here rather than letting the database check constraint
  // surface as a 500.
  if (body.profileId === followerId) return errorResponse("You cannot follow yourself", 422);

  try {
    await dependencies.store.follow(followerId, body.profileId);
    return new Response(null, { status: 204, headers: headers() });
  } catch {
    return errorResponse("Following this profile failed", 503);
  }
}

/** POST /api/profiles/unfollow — body `{ profileId }`. Idempotent. */
export async function handleUnfollowProfile(
  request: Request,
  dependencies: ProfileFollowApiDependencies
): Promise<Response> {
  const followerId = await follower(dependencies);
  if (followerId instanceof Response) return followerId;
  const body = await parseBody(request);
  if (body instanceof Response) return body;

  try {
    await dependencies.store.unfollow(followerId, body.profileId);
    return new Response(null, { status: 204, headers: headers() });
  } catch {
    return errorResponse("Unfollowing this profile failed", 503);
  }
}

/** GET /api/profiles/followed — `{ profiles }` for the caller, private/no-store. */
export async function handleListFollowedProfiles(
  dependencies: ProfileFollowApiDependencies
): Promise<Response> {
  const followerId = await follower(dependencies);
  if (followerId instanceof Response) return followerId;
  try {
    return Response.json({ profiles: await dependencies.store.listFollowed(followerId) }, { headers: headers() });
  } catch {
    return errorResponse("Followed profiles are unavailable", 503);
  }
}
