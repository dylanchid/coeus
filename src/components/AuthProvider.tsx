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
  /** Provider display name (GitHub `user_name`, Google `full_name`, …); shown until the profile handle loads. */
  name: string | null;
  /** Provider avatar URL, or null when the provider gave none / it wasn't https. */
  avatarUrl: string | null;
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
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null;
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

function toAuthUser(user: NonNullable<SessionLike["user"]>): AuthUser {
  const meta = user.user_metadata ?? {};
  const str = (key: string): string | null => (typeof meta[key] === "string" ? (meta[key] as string) : null);
  const avatar = str("avatar_url") ?? str("picture");
  return {
    id: user.id,
    email: user.email ?? null,
    name: str("user_name") ?? str("preferred_username") ?? str("full_name") ?? str("name"),
    avatarUrl: avatar && avatar.startsWith("https://") ? avatar : null,
  };
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

  const loadProfile = useCallback(async (signedIn: boolean) => {
    if (!signedIn) {
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
      setUser(session?.user ? toAuthUser(session.user) : null);
      void loadProfile(Boolean(session?.user));
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
    await loadProfile(Boolean(user));
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
