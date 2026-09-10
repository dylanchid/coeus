"use client";

import { useState, type FormEvent } from "react";
import { useAuth, type OAuthProvider } from "./AuthProvider";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
];

/**
 * Sign-in surface. The buttons hand off to Supabase's OAuth redirect; the
 * browser leaves the app and returns to /auth/callback, so there is no
 * "signed in" success state to render here.
 *
 * `devSignIn` is true only when the server has `E2E_TEST_LOGIN=1` set outside
 * production — it adds a local-only shortcut that mints a session through
 * `/api/test/session` so profile work does not need localhost OAuth redirect
 * URIs configured upstream.
 */
export function SignInPanel({
  next = "/welcome",
  errorMessage,
  devSignIn = false,
}: {
  next?: string;
  errorMessage?: string | null;
  devSignIn?: boolean;
}) {
  const { signIn, unavailable } = useAuth();
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(errorMessage ?? null);

  const start = async (provider: OAuthProvider) => {
    setError(null);
    setPending(provider);
    const { error: failure } = await signIn(provider, next);
    if (failure) {
      setError(failure);
      setPending(null);
    }
    // On success the browser navigates away; leave the button in its pending state.
  };

  return (
    <section className="signin-panel" aria-labelledby="signin-heading">
      <h1 id="signin-heading">Sign in to Coeus</h1>
      <p className="signin-lede">
        Your archive stays on this device until you sign in. Signing in syncs it, unlocks recovery, and lets you
        publish collections and connect destinations.
      </p>

      {error ? (
        <p className="signin-error" role="alert">
          {error}
        </p>
      ) : null}

      {unavailable ? (
        <p className="signin-error" role="alert">
          Sign-in isn’t configured in this environment yet.
        </p>
      ) : null}

      <div className="signin-providers">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={unavailable || pending !== null}
            onClick={() => void start(provider.id)}
          >
            {pending === provider.id ? `Redirecting to ${provider.label}…` : `Continue with ${provider.label}`}
          </button>
        ))}
      </div>

      {devSignIn ? <DevSignIn next={next} onError={setError} /> : null}
    </section>
  );
}

/** Local-part of the reserved test email, derived from the typed name. */
function testSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dev";
}

/** Local-only session shortcut. Never rendered when the server flag is off. */
function DevSignIn({ next, onError }: { next: string; onError: (message: string | null) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = testSlug(name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/test/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: `${slug}@e2e.coeus.local`,
          userMetadata: name.trim() ? { user_name: name.trim(), full_name: name.trim() } : undefined,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        onError(`Dev sign-in failed (${response.status}). ${detail}`.trim());
        setBusy(false);
        return;
      }
      window.location.assign(next);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Dev sign-in failed");
      setBusy(false);
    }
  };

  return (
    <form className="signin-dev" onSubmit={submit}>
      <p className="signin-dev-label">Local dev only</p>
      <label className="signin-dev-field">
        <span>Test account name (optional)</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="dev"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Dev sign in"}
      </button>
      <p className="signin-dev-note">
        Mints a session for <code>{slug}@e2e.coeus.local</code> via <code>/api/test/session</code>.
        No OAuth, no email. Reusing a name signs back into the same account.
      </p>
    </form>
  );
}
