/**
 * Weekly week-over-week storage-growth check — the one README
 * "Observability › Alerting" row the log-threshold backstop can't cover
 * (`archive_storage_stats` total `snapshot_bytes` growth), because it needs
 * persisted state.
 *
 * Calls the `capture_storage_growth()` RPC with the service key (which appends
 * this week's reading and returns last week's), evaluates the pair with the
 * pure evaluator in src/lib/storageGrowth.ts, prints the result, and — exactly
 * like scripts/log-thresholds.mts — exits non-zero on a `page` breach so
 * `.github/workflows/storage-growth.yml` fails the run (email + GitHub mobile,
 * plus ALERT_WEBHOOK_URL when set). A `warn` breach prints but keeps the run
 * green.
 *
 * Env:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL         required
 *   SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY required
 *   ALERT_WEBHOOK_URL                               optional — Slack/Discord webhook
 *
 * When the Supabase env is not configured the script prints a warning and
 * exits 0, so the workflow can be committed before the production secrets are
 * wired.
 */
import { createClient } from "@supabase/supabase-js";

import { evaluateStorageGrowth } from "../src/lib/storageGrowth.ts";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log(
    "::warning::storage-growth: SUPABASE_URL / SUPABASE_SECRET_KEY not set — skipping. " +
      "Set them as repo secrets to enable the weekly check.",
  );
  process.exit(0);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data, error } = await supabase.rpc("capture_storage_growth").single();
if (error) {
  console.error(`capture_storage_growth failed: ${error.message}`);
  process.exit(2);
}

const row = data as {
  current_bytes: number;
  current_at: string;
  previous_bytes: number | null;
  previous_at: string | null;
};

console.log(
  `Captured ${row.current_bytes} bytes at ${row.current_at}` +
    (row.previous_at ? ` (previous: ${row.previous_bytes} at ${row.previous_at}).` : " (first reading — no baseline yet)."),
);

const breach = evaluateStorageGrowth({
  currentBytes: row.current_bytes,
  currentAt: row.current_at,
  previousBytes: row.previous_bytes,
  previousAt: row.previous_at,
});

if (!breach) {
  console.log("✓ No storage-growth breach.");
  process.exit(0);
}

const icon = breach.severity === "page" ? "🔴 PAGE" : "🟡 WARN";
console.log(`${icon}  ${breach.signal} — observed ${breach.observed} (threshold ${breach.threshold})`);

const webhook = process.env.ALERT_WEBHOOK_URL;
if (webhook && breach.severity === "page") {
  const text = `🔴 coeuscoeus.com storage growth breached: ${breach.signal} — ${breach.observed}`;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (postError) {
    console.error(`webhook post failed: ${postError instanceof Error ? postError.message : postError}`);
  }
}

process.exit(breach.severity === "page" ? 1 : 0);
