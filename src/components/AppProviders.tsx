"use client";

import { createContext, useContext } from "react";
import { AuthProvider, type AuthClientLike } from "./AuthProvider";
import { ChromeProvider } from "./ChromeProvider";
import { ProfileGate } from "./ProfileGate";
import { FollowedCollectionsSync } from "./FollowedCollectionsSync";
import { usePreferencesProvider, type PreferencesContextValue } from "./usePreferencesProvider";
import { useArchiveProvider, type ArchiveContextValue } from "./useArchiveProvider";

export type { PrefsUpdate } from "./usePreferencesProvider";

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const ArchiveContext = createContext<ArchiveContextValue | null>(null);

/**
 * The root UI integration point for preferences and archive state. It is a
 * composition shell: the two workflows live in `usePreferencesProvider` and
 * `useArchiveProvider` (each already memoizes its context value); this component
 * only wires the providers together in the required nesting order.
 */
export function AppProviders({
  children,
  authClient,
}: {
  children: React.ReactNode;
  /** Test seam: in-memory auth client passed through to AuthProvider. */
  authClient?: AuthClientLike;
}) {
  const preferences = usePreferencesProvider();
  const archive = useArchiveProvider();
  return (
    <AuthProvider client={authClient}>
      <PreferencesContext.Provider value={preferences}>
        <ArchiveContext.Provider value={archive}>
          <ChromeProvider>
            <FollowedCollectionsSync />
            {children}
            <ProfileGate />
          </ChromeProvider>
        </ArchiveContext.Provider>
      </PreferencesContext.Provider>
    </AuthProvider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside AppProviders");
  return value;
}

export function useArchive(): ArchiveContextValue {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error("useArchive must be used inside AppProviders");
  return value;
}
