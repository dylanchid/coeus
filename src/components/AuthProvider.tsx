"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase.client";
import type { Profile } from "@/lib/profile";

export type OAuthProvider = "github" | "google";

/**
 * "loading"      — still resolving the session on first paint
 * "signed-out"   — no session (or auth is unconfigured in this environment)
 * "needs-profile"— signed in, but no profile row yet: onboarding is required
 * "ready"        — signed in with a completed profile
 */
export type AuthStatus = "loading" | "signed-out" | "needs-profile" | "ready";

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  profile: Profile | null;
  /** True when no Supabase auth client could be constructed (missing env). Sign-in is unavailable. */
  unavailable: boolean;
  signIn(provider: OAuthProvider, next?: string): Promise<{ error: string | null }>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
  /** Adopt a freshly-saved profile without a round trip (used by the onboarding form). */
  applyProfile(profile: Profile): void;
}

/** The narrow slice of the Supabase client this provider uses; kept as an interface so tests can inject a fake. */
export interface AuthClientLike {
  auth: {
    getSession(): Promise<{ data: { session: SessionLike | null } }>;
    onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signInWithOAuth(options: {
      provider: OAuthProvider;
      options?: { redirectTo?: string };
    }): Promise<{ error: { message: string } | null }>;
    signOut(): Promise<{ error: unknown }>;
  };
}

interface SessionLike {
  user: { id: string; email?: string | null } | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveClient(injected?: AuthClientLike): AuthClientLike | null {
  if (injected) return injected;
  try {
    return createBrowserSupabaseClient() as unknown as AuthClientLike;
  } catch {
    return null;
  }
}

export function AuthProvider({
  children,
  client,
}: {
  children: React.ReactNode;
  /** Test seam: an in-memory stand-in for the Supabase client. */
  client?: AuthClientLike;
}) {
  // Constructed once: the initializer runs on the first render only.
  const [supabase] = useState<AuthClientLike | null>(() => resolveClient(client));

  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "signed-out");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (nextUser: AuthUser | null) => {
    if (!nextUser) {
      setProfile(null);
      setStatus("signed-out");
      return;
    }
    try {
      const response = await fetch("/api/account/profile", { credentials: "same-origin", cache: "no-store" });
      if (response.ok) {
        const body = (await response.json()) as { profile: Profile | null };
        setProfile(body.profile);
        setStatus(body.profile ? "ready" : "needs-profile");
        return;
      }
    } catch {
      /* fall through to the conservative default below */
    }
    // Signed in but the profile endpoint is unreachable: treat as onboarding-pending
    // rather than locking the user out of the app.
    setProfile(null);
    setStatus("needs-profile");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    const applySession = (session: SessionLike | null) => {
      if (!active) return;
      const nextUser: AuthUser | null = session?.user
        ? { id: session.user.id, email: session.user.email ?? null }
        : null;
      setUser(nextUser);
      void loadProfile(nextUser);
    };

    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signIn = useCallback<AuthContextValue["signIn"]>(
    async (provider, next = "/welcome") => {
      if (!supabase) return { error: "Sign-in is not configured in this environment." };
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : undefined;
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      return { error: error?.message ?? null };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    try {
      await supabase?.auth.signOut();
    } finally {
      try {
        await fetch("/api/account/signout", { method: "POST", credentials: "same-origin" });
      } catch {
        /* the client-side sign-out already cleared the session */
      }
      setUser(null);
      setProfile(null);
      setStatus("signed-out");
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [loadProfile, user]);

  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
    setStatus("ready");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, profile, unavailable: !supabase, signIn, signOut, refreshProfile, applyProfile }),
    [status, user, profile, supabase, signIn, signOut, refreshProfile, applyProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
