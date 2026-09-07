import { runHealthChecks } from "@/lib/healthCheck";
import { logEvent, requestCorrelationId } from "@/lib/serverLog";
import { createAdminSupabaseClient, requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/**
 * Readiness probe for Vercel/uptime monitoring. Unauthenticated by design, but
 * the body is only check names, booleans, and durations — no identifiers, no
 * error messages. 200 when every check passes, 503 otherwise.
 */
export async function GET(request: Request): Promise<Response> {
  const correlationId = requestCorrelationId(request);
  const report = await runHealthChecks({
    config: async () => {
      requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
      requiredEnvironment("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    },
    database: async () => {
      const supabase = createAdminSupabaseClient();
      const { error } = await supabase.from("archives").select("id", { head: true, count: "exact" }).limit(1);
      if (error) throw new Error(error.message);
    },
  });

  logEvent(report.status === "ok" ? "health.check" : "health.check.error", {
    correlationId,
    status: report.status,
    durationMs: report.durationMs,
    failing: report.checks.filter((check) => !check.ok).map((check) => check.name).join(",") || undefined,
  });

  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Liveness: the process is up and routing. Always 200. */
export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
