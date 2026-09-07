const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

const head = await fetch(new URL("/api/health", baseUrl), { method: "HEAD", redirect: "manual" });
if (head.status !== 200) throw new Error(`HEAD /api/health returned ${head.status}, expected 200 (liveness)`);

const response = await fetch(new URL("/api/health", baseUrl), { redirect: "manual" });
if (response.status !== 200 && response.status !== 503) {
  throw new Error(`GET /api/health returned ${response.status}, expected 200 or 503`);
}

const body = (await response.json()) as {
  status: string;
  durationMs: number;
  checks: { name: string; ok: boolean; durationMs: number; detail?: string }[];
};

if (body.status !== "ok" && body.status !== "degraded") throw new Error(`unexpected status "${body.status}"`);
if (!Array.isArray(body.checks) || body.checks.length === 0) throw new Error("health report has no checks");
if ((body.status === "ok") !== (response.status === 200)) throw new Error("status/HTTP code disagree");

const serialized = JSON.stringify(body);
for (const marker of ["postgres://", "eyJ", "secret", "SUPABASE", "http://127.0.0.1", "Bearer "]) {
  if (serialized.includes(marker)) throw new Error(`health body leaks "${marker}"`);
}

const failing = body.checks.filter((check) => !check.ok).map((check) => `${check.name} (${check.detail ?? "?"})`);
console.log(
  `Health: ${body.status} in ${body.durationMs}ms — ${body.checks.length} checks${failing.length ? `, failing: ${failing.join(", ")}` : ""}.`
);
