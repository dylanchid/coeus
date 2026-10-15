/**
 * Free, in-repo backstop for the README "Observability › Alerting" log-based
 * thresholds. Pulls a window of Vercel runtime/request logs, maps them onto the
 * pure evaluator in src/lib/logThresholds.ts, prints the breaches, and exits
 * non-zero on any `page`-level breach so `.github/workflows/log-alerts.yml`
 * fails the run (email + GitHub mobile, and ALERT_WEBHOOK_URL when set) — the
 * same pattern as uptime.yml.
 *
 * A real log platform with sustained-window alerting is still the recommended
 * primary; this only sees whatever the polling window captured.
 *
 * Env:
 *   VERCEL_TOKEN          required (unless --input) — Vercel access token
 *   VERCEL_PROJECT        optional — project name or id (else the linked project)
 *   VERCEL_TEAM_ID        optional — team slug or id
 *   LOG_WINDOW_MINUTES    optional — lookback window, default 30
 *   ALERT_WEBHOOK_URL     optional — Slack/Discord-compatible incoming webhook
 *
 * Flags:
 *   --input <file>   read JSON-lines from a file instead of calling `vercel logs`
 *   --window <min>   override LOG_WINDOW_MINUTES
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { evaluateLogThresholds, parseVercelLogLines, worstSeverity } from "../src/lib/logThresholds.ts";

// Pinned: an unpinned CLI changed its JSON shape and left this check silently
// reading zero records. Bump deliberately and re-run the parser tests.
const VERCEL_CLI = "vercel@64.2.0";
const LOG_LIMIT = 5000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const windowMinutes = Number(arg("window") ?? process.env.LOG_WINDOW_MINUTES ?? 30);
const inputFile = arg("input");

function fetchLogLines(): string[] {
  if (inputFile) return readFileSync(inputFile, "utf8").split("\n").filter(Boolean);

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.error("VERCEL_TOKEN is required (or pass --input <file>).");
    process.exit(2);
  }
  const args = [
    VERCEL_CLI,
    "logs",
    "--json",
    "--since",
    `${windowMinutes}m`,
    "--environment",
    "production",
    "--limit",
    String(LOG_LIMIT),
    "--token",
    token,
  ];
  if (process.env.VERCEL_PROJECT) args.push("--project", process.env.VERCEL_PROJECT);
  if (process.env.VERCEL_TEAM_ID) args.push("--scope", process.env.VERCEL_TEAM_ID);

  const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").filter(Boolean);
}

const rawLines = fetchLogLines();
const { logs, requests, records, recognized, truncated } = parseVercelLogLines(rawLines);
console.log(`Scanned ${logs.length} structured log line(s) and ${requests.length} request(s) over ${windowMinutes}m (${recognized}/${records} records recognized).`);

// A clean result is only meaningful if the records were understood. If the CLI
// returned records but none matched a known shape, its JSON format changed:
// fail loudly instead of reporting a silently empty window.
if (records > 0 && recognized === 0) {
  console.error(`Unrecognized \`vercel logs --json\` format: none of ${records} record(s) parsed. Update parseVercelLogLines in src/lib/logThresholds.ts.`);
  process.exit(2);
}
if (records > 0 && requests.length === 0) {
  // Request-status signals need a path and status on each record. Print field
  // names only (never values) so a renamed field is easy to spot.
  const fields = new Set<string>();
  for (const raw of rawLines) {
    try {
      const record = JSON.parse(raw);
      const entry = record?.type === "log" ? record.data : record;
      if (entry && typeof entry === "object" && record?.type !== "summary") Object.keys(entry).forEach((k) => fields.add(k));
    } catch {
      // skip
    }
  }
  console.warn(`Warning: no request path/status found in ${records} record(s). Fields seen: ${[...fields].sort().join(", ")}`);
}
if (truncated) console.warn(`Warning: the CLI returned only part of this window (limit ${LOG_LIMIT}); breaches may be undercounted.`);

const breaches = evaluateLogThresholds({ windowMinutes, logs, requests });
const severity = worstSeverity(breaches);

if (!severity) {
  console.log("✓ No threshold breaches.");
  process.exit(0);
}

for (const b of breaches) {
  const icon = b.severity === "page" ? "🔴 PAGE" : "🟡 WARN";
  console.log(`${icon}  ${b.signal} — observed ${b.observed} (threshold ${b.threshold})`);
}

const webhook = process.env.ALERT_WEBHOOK_URL;
if (webhook && severity === "page") {
  const lines = breaches
    .filter((b) => b.severity === "page")
    .map((b) => `• ${b.signal}: ${b.observed}`)
    .join("\n");
  const text = `🔴 coeuscoeus.com log thresholds breached (last ${windowMinutes}m):\n${lines}`;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error(`webhook post failed: ${error instanceof Error ? error.message : error}`);
  }
}

// WARN-only breaches surface in the log but keep the run green, matching how
// uptime.yml only fails on an outright health failure.
process.exit(severity === "page" ? 1 : 0);
