/**
 * Whether the test-only sign-in route (`/api/test/session`) is armed.
 *
 * `E2E_TEST_LOGIN=1` turns it on; it is meant for local `npm run dev` /
 * `npm run test:e2e` and the CI e2e job only. The `VERCEL_ENV` / `NODE_ENV`
 * checks are belt-and-braces refusals in case the flag ever leaks into a
 * production build or runtime. Keep this the single source of truth so the
 * route and the sign-in UI can never disagree about whether dev sign-in exists.
 */
export function devSignInEnabled(): boolean {
  return (
    process.env.E2E_TEST_LOGIN === "1" &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.NODE_ENV !== "production"
  );
}

/** Reserved test-account email domain — see e2e/support/testUsers.ts. */
export const TEST_EMAIL_DOMAIN = "@e2e.coeus.local";
