/**
 * Canonical Playwright test identities. Emails live on the reserved
 * `@e2e.coeus.local` domain so a real inbox is never involved and a stray
 * production run could not match a real account. Handles are fixed per user so
 * re-running the suite is idempotent — each user owns its handle, so the
 * profile PUT updates in place rather than colliding.
 */
export interface TestUser {
  email: string;
  /** Provider-style metadata surfaced by AuthProvider before the profile loads. */
  userMetadata: Record<string, string>;
  /** Present when the user should already have completed onboarding. */
  profile?: { handle: string; displayName: string; bio: string };
}

/**
 * A never-before-seen account, for the onboarding journey (which creates a
 * profile row and so cannot be re-run against a fixed identity). Each call
 * returns a unique email; the disposable database is thrown away after the run.
 */
export function newFreshUser(): TestUser {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    email: `fresh-${nonce}@e2e.coeus.local`,
    userMetadata: { user_name: "fresh-tester", full_name: "Fresh Tester" },
  };
}

/**
 * A signed-in account that has finished onboarding. Unique per call — a fixed
 * identity would have every parallel worker racing on the same profile row and
 * handle. The handle is <= 20 chars and matches HANDLE_PATTERN.
 */
export function newEstablishedUser(): TestUser & { profile: NonNullable<TestUser["profile"]> } {
  const nonce = Math.random().toString(36).slice(2, 8);
  return {
    email: `established-${nonce}@e2e.coeus.local`,
    userMetadata: { user_name: "established-tester", full_name: "Established Tester" },
    profile: {
      handle: `est_${nonce}`,
      displayName: "Established Tester",
      bio: "Fixture account for authenticated Playwright journeys.",
    },
  };
}
