/**
 * Minimal readiness checks for a Vercel + Supabase deployment. Each probe is a
 * function that resolves when healthy and throws when not; the report carries
 * only names, booleans, durations, and error *class* names — never messages,
 * connection strings, or identifiers.
 */

export interface HealthCheckResult {
  name: string;
  ok: boolean;
  durationMs: number;
  /** Error class name on failure (e.g. "TimeoutError"); never a message. */
  detail?: string;
}

export interface HealthReport {
  status: "ok" | "degraded";
  durationMs: number;
  checks: HealthCheckResult[];
}

export async function runHealthChecks(probes: Record<string, () => Promise<void>>): Promise<HealthReport> {
  const startedAt = Date.now();
  const checks: HealthCheckResult[] = [];
  for (const [name, probe] of Object.entries(probes)) {
    const probeStartedAt = Date.now();
    try {
      await probe();
      checks.push({ name, ok: true, durationMs: Date.now() - probeStartedAt });
    } catch (error) {
      checks.push({
        name,
        ok: false,
        durationMs: Date.now() - probeStartedAt,
        detail: error instanceof Error ? error.name || "Error" : "Error",
      });
    }
  }
  return {
    status: checks.every((check) => check.ok) ? "ok" : "degraded",
    durationMs: Date.now() - startedAt,
    checks,
  };
}
