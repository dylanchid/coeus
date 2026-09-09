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

export const FRESH_USER: TestUser = {
  email: "fresh@e2e.coeus.local",
  userMetadata: { user_name: "fresh-tester", full_name: "Fresh Tester" },
};

export const ESTABLISHED_USER: TestUser = {
  email: "established@e2e.coeus.local",
  userMetadata: { user_name: "established-tester", full_name: "Established Tester" },
  profile: {
    handle: "established_e2e",
    displayName: "Established Tester",
    bio: "Fixture account for authenticated Playwright journeys.",
  },
};
