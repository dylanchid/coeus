/**
 * Deletes the reserved test accounts (and, by cascade, their profiles and
 * archives) after the run, so a local `npm run test:e2e` against the shared dev
 * database does not leave rows that would break the count-based pgTAP tests.
 * Hits the already-running dev server, which holds the Supabase service key.
 * CI throws its whole disposable stack away, so a failure here is only logged.
 */
export default async function globalTeardown(): Promise<void> {
  const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
  try {
    const response = await fetch(`http://localhost:${port}/api/test/session?purge=1`, { method: "DELETE" });
    if (response.ok) {
      const body = (await response.json()) as { purged?: number };
      console.log(`[e2e teardown] purged ${body.purged ?? 0} test account(s)`);
    } else {
      console.warn(`[e2e teardown] purge returned ${response.status}`);
    }
  } catch (error) {
    console.warn(`[e2e teardown] purge failed: ${error instanceof Error ? error.message : error}`);
  }
}
