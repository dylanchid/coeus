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

import {
  evaluateLogThresholds,
  worstSeverity,
  type RequestLine,
  type ServerLogLine,
} from "../src/lib/logThresholds.ts";

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
    "vercel@latest",
    "logs",
    "--json",
    "--since",
    `${windowMinutes}m`,
    "--environment",
    "production",
    "--limit",
    "5000",
    "--token",
    token,
  ];
  if (process.env.VERCEL_PROJECT) args.push("--project", process.env.VERCEL_PROJECT);
  if (process.env.VERCEL_TEAM_ID) args.push("--scope", process.env.VERCEL_TEAM_ID);

  const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").filter(Boolean);
}

/** Best-effort: the CLI's JSON shape has shifted over versions, so probe a few field names. */
function messageOf(entry: Record<string, unknown>): string | undefined {
  const candidates = [entry.message, entry.text, (entry.payload as Record<string, unknown>)?.text, entry.log];
  const hit = candidates.find((v) => typeof v === "string");
  return hit as string | undefined;
}
function pathOf(entry: Record<string, unknown>): string | undefined {
  const p = entry.path ?? entry.requestPath ?? (entry.proxy as Record<string, unknown>)?.path;
  return typeof p === "string" ? p : undefined;
}
function statusOf(entry: Record<string, unknown>): number | undefined {
  const s = entry.statusCode ?? entry.status ?? (entry.proxy as Record<string, unknown>)?.statusCode;
  return typeof s === "number" ? s : undefined;
}

const logs: ServerLogLine[] = [];
const requests: RequestLine[] = [];

for (const raw of fetchLogLines()) {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(raw);
  } catch {
    continue;
  }

  const path = pathOf(entry);
  const statusCode = statusOf(entry);
  if (path && typeof statusCode === "number") requests.push({ path, statusCode });

  const message = messageOf(entry);
  if (!message) continue;
  const start = message.indexOf("{");
  if (start < 0) continue;
  try {
    const structured = JSON.parse(message.slice(start));
    if (structured && typeof structured.event === "string") {
      logs.push({
        event: structured.event,
        route: structured.route,
        operation: structured.operation,
        statusClass: structured.statusClass,
        durationMs: typeof structured.durationMs === "number" ? structured.durationMs : undefined,
      });
    }
  } catch {
    // not one of our structured lines
  }
}

const breaches = evaluateLogThresholds({ windowMinutes, logs, requests });
const severity = worstSeverity(breaches);

console.log(
  `Scanned ${logs.length} structured log line(s) and ${requests.length} request(s) over ${windowMinutes}m.`,
);

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
