import { devSignInEnabled, TEST_EMAIL_DOMAIN } from "@/lib/devAuth.server";
import { createAdminSupabaseClient, createRequestSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/**
 * Test-only sign-in. Playwright's authenticated journeys — and local profile
 * work when OAuth redirect URIs aren't configured for localhost — need a
 * deterministic signed-in session without a real OAuth round trip, so this
 * route creates/reuses the requested test user through local email/password
 * auth on a request-scoped client, which writes the same `sb-*` cookies the
 * OAuth callback would.
 *
 * Armed only when `devSignInEnabled()` (E2E_TEST_LOGIN=1, non-production).
 */

const testLoginEnabled = devSignInEnabled;

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
  if (!email.endsWith(TEST_EMAIL_DOMAIN)) {
    return Response.json(
      { error: `\`email\` must be on the reserved ${TEST_EMAIL_DOMAIN} domain` },
      { status: 400 },
    );
  }
  const userMetadata =
    body.userMetadata && typeof body.userMetadata === "object"
      ? (body.userMetadata as Record<string, unknown>)
      : undefined;

  const supabase = await createRequestSupabaseClient();
  const password = `coeus-dev-${email}`;

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: userMetadata ? { data: userMetadata } : undefined,
  });
  if (signUpError && !/already|registered|exists/i.test(signUpError.message)) {
    return Response.json({ error: signUpError.message }, { status: 502 });
  }

  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !session.user) {
    return Response.json({ error: signInError?.message ?? "Could not mint a session" }, { status: 502 });
  }

  return Response.json({ userId: session.user.id, email });
}

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
