import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/**
 * Test-only sign-in. Playwright's authenticated journeys need a deterministic
 * signed-in session without a real OAuth round trip, so this route mints one:
 * it upserts the requested user with the service key, generates a magic-link
 * token, and verifies it against a request-scoped client — which writes the
 * same `sb-*` cookies the OAuth callback would.
 *
 * It is inert unless `E2E_TEST_LOGIN=1` is set in the environment. That flag is
 * only ever present for the e2e job and local Playwright runs; it is never set
 * on a deployed environment. The extra `VERCEL_ENV === "production"` guard is a
 * belt-and-braces refusal in case the flag ever leaks.
 */
function testLoginEnabled(): boolean {
  return process.env.E2E_TEST_LOGIN === "1" && process.env.VERCEL_ENV !== "production";
}

interface SessionRequest {
  email?: unknown;
  /** Optional provider-style metadata, e.g. `{ user_name: "fresh-tester" }`. */
  userMetadata?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (!testLoginEnabled()) {
    return new Response(null, { status: 404 });
  }

  let body: SessionRequest;
  try {
    body = (await request.json()) as SessionRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return Response.json({ error: "An `email` is required" }, { status: 400 });
  }
  const userMetadata =
    body.userMetadata && typeof body.userMetadata === "object"
      ? (body.userMetadata as Record<string, unknown>)
      : undefined;

  const admin = createAdminSupabaseClient();

  // GoTrue has no "get user by email", so page through until we find them. Test
  // projects hold a handful of users, so one page is always enough.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) {
    return Response.json({ error: listError.message }, { status: 502 });
  }
  let userId = existing.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (created?.user) {
      userId = created.user.id;
    } else {
      // Two parallel Playwright workers can both create the same fixture user;
      // the loser sees a duplicate-email error. Re-resolve before giving up.
      const { data: retry } = await admin.auth.admin.listUsers({ perPage: 200 });
      userId = retry?.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
      if (!userId) {
        return Response.json({ error: createError?.message ?? "User creation failed" }, { status: 502 });
      }
    }
  } else if (userMetadata) {
    await admin.auth.admin.updateUserById(userId, { user_metadata: userMetadata });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return Response.json({ error: linkError?.message ?? "Could not mint a session" }, { status: 502 });
  }

  const supabase = await createRequestSupabaseClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (verifyError) {
    return Response.json({ error: verifyError.message }, { status: 502 });
  }

  return Response.json({ userId, email });
}

/** Reserved test-account email domain — see e2e/support/testUsers.ts. */
const TEST_EMAIL_DOMAIN = "@e2e.coeus.local";

/**
 * `DELETE` clears the session cookies, so a spec can return a shared page to
 * the signed-out state without waiting on the client sign-out flow.
 *
 * `DELETE ?purge=1` additionally deletes every account on the reserved test
 * email domain — the Playwright global teardown calls it so a local
 * `npm run test:e2e` run does not leave rows in the shared dev database (which
 * would then break the count-based pgTAP tests).
 */
export async function DELETE(request: Request): Promise<Response> {
  if (!testLoginEnabled()) {
    return new Response(null, { status: 404 });
  }

  const supabase = await createRequestSupabaseClient();
  await supabase.auth.signOut();

  if (new URL(request.url).searchParams.get("purge") === "1") {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return Response.json({ error: error.message }, { status: 502 });
    const stale = data.users.filter((user) => user.email?.toLowerCase().endsWith(TEST_EMAIL_DOMAIN));
    await Promise.all(stale.map((user) => admin.auth.admin.deleteUser(user.id)));
    return Response.json({ purged: stale.length });
  }

  return new Response(null, { status: 204 });
}
