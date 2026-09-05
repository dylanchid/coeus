"use client";

import { useState } from "react";
import { useAuth, type OAuthProvider } from "./AuthProvider";

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
];

/**
 * Sign-in surface. The buttons hand off to Supabase's OAuth redirect; the
 * browser leaves the app and returns to /auth/callback, so there is no
 * "signed in" success state to render here.
 */
export function SignInPanel({ next = "/welcome", errorMessage }: { next?: string; errorMessage?: string | null }) {
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
    </section>
  );
}
