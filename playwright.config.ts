import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);

/**
 * Supabase wiring for the dev server Playwright starts.
 *
 * Locally, `next dev` reads `.env.local` on its own, so we pass a Supabase var
 * through to the child only when the ambient shell already has one (the CI job
 * exports them from `supabase status -o env`). Passing a value here always
 * overrides `.env.local`, so an unconditional placeholder would break the
 * authenticated journeys on a developer machine.
 */
const passthrough = (name: string): Record<string, string> =>
  process.env[name] ? { [name]: process.env[name] as string } : {};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    // The public shell renders without a Supabase session; the authenticated
    // specs need the disposable stack the CI job (or `.env.local`) provides.
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      // Arms the test-only /api/test/session sign-in route. Never set on a
      // deployed environment.
      E2E_TEST_LOGIN: "1",
      ...passthrough("NEXT_PUBLIC_SUPABASE_URL"),
      ...passthrough("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      ...passthrough("SUPABASE_SECRET_KEY"),
    },
  },
});
