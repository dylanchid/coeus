/**
 * The log-based alert thresholds from the README "Observability › Alerting"
 * table, as a pure evaluator. `scripts/log-thresholds.mts` pulls a window of
 * Vercel runtime logs, maps them onto {@link ServerLogLine} / {@link RequestLine},
 * and hands them here; the GitHub Actions backstop
 * (`.github/workflows/log-alerts.yml`) fails the run and pages on any `page`
 * breach, mirroring `uptime.yml`.
 *
 * This is a free, in-repo safety net operating on a short polling window — a
 * real log platform (Vercel Observability, or a Log Drain to
 * BetterStack/Axiom/Datadog) with sustained-window alerting is still the
 * recommended primary. The `archive_storage_stats` growth row needs
 * week-over-week state and lives in its own evaluator ({@link ./storageGrowth}).
 */

/** One structured line emitted by `serverLog.ts` (`instrument()` or `logEvent()`). */
export interface ServerLogLine {
  event: string;
  route?: string;
  operation?: string;
  statusClass?: "2xx" | "4xx" | "5xx" | "error" | (string & {});
  durationMs?: number;
}

/** One Vercel request-log entry (path + final status). */
export interface RequestLine {
  path: string;
  statusCode: number;
}

export interface ThresholdInput {
  windowMinutes: number;
  logs: ServerLogLine[];
  requests?: RequestLine[];
}

export type Severity = "warn" | "page";

export interface Breach {
  signal: string;
  severity: Severity;
  observed: string;
  threshold: string;
}

// A rate signal needs a floor of traffic before a breach means anything —
// otherwise one error on a quiet route reads as a 100% error rate.
const MIN_SAMPLES_WARN = 20;
const MIN_SAMPLES_PAGE = 10;

function isError(line: ServerLogLine): boolean {
  return line.event.endsWith(".error") || line.statusClass === "error" || line.statusClass === "5xx";
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function evaluateLogThresholds(input: ThresholdInput): Breach[] {
  const { windowMinutes, logs, requests = [] } = input;
  const breaches: Breach[] = [];

  // 1. GET /api/health non-200.
  const healthFails = requests.filter(
    (r) => r.path.split("?")[0].replace(/\/$/, "") === "/api/health" && r.statusCode !== 200,
  ).length;
  if (healthFails > 0) {
    const sustained = healthFails >= 2 && windowMinutes >= 2;
    breaches.push({
      signal: "GET /api/health non-200",
      severity: sustained ? "page" : "warn",
      observed: `${healthFails} non-200 response(s) in ${windowMinutes}m`,
      threshold: sustained ? "sustained > 2 min" : "any, 1 sample",
    });
  }

  // 2. `*.error` log rate, per route.
  const byRoute = new Map<string, { total: number; errors: number }>();
  for (const line of logs) {
    if (!line.route) continue;
    // archive.sync has its own dedicated 5xx / p95 rows below — don't also
    // fold it into the generic per-route rate.
    if (line.route === "archive.sync") continue;
    const bucket = byRoute.get(line.route) ?? { total: 0, errors: 0 };
    bucket.total += 1;
    if (isError(line)) bucket.errors += 1;
    byRoute.set(line.route, bucket);
  }
  for (const [route, { total, errors }] of byRoute) {
    if (errors === 0) continue;
    const rate = errors / total;
    if (rate > 0.05 && total >= MIN_SAMPLES_PAGE) {
      breaches.push({
        signal: `${route} error rate`,
        severity: "page",
        observed: `${pct(rate)} (${errors}/${total}) in ${windowMinutes}m`,
        threshold: "> 5% over 5 min",
      });
    } else if (rate > 0.01 && total >= MIN_SAMPLES_WARN) {
      breaches.push({
        signal: `${route} error rate`,
        severity: "warn",
        observed: `${pct(rate)} (${errors}/${total}) in ${windowMinutes}m`,
        threshold: "> 1% over 15 min",
      });
    }
  }

  // 3 + 4. archive.sync 5xx rate and p95 duration.
  const sync = logs.filter((l) => l.route === "archive.sync");
  if (sync.length >= MIN_SAMPLES_PAGE) {
    const fivexx = sync.filter((l) => l.statusClass === "5xx").length;
    const rate = fivexx / sync.length;
    if (rate > 0.1) {
      breaches.push({
        signal: "archive.sync 5xx rate",
        severity: "page",
        observed: `${pct(rate)} (${fivexx}/${sync.length})`,
        threshold: "> 10% over 5 min",
      });
    } else if (rate > 0.02 && sync.length >= MIN_SAMPLES_WARN) {
      breaches.push({
        signal: "archive.sync 5xx rate",
        severity: "warn",
        observed: `${pct(rate)} (${fivexx}/${sync.length})`,
        threshold: "> 2% over 15 min",
      });
    }
  }
  const syncDurations = sync.map((l) => l.durationMs).filter((d): d is number => typeof d === "number");
  if (syncDurations.length) {
    const p95 = percentile(syncDurations, 95);
    if (p95 > 5000) {
      breaches.push({
        signal: "archive.sync p95 durationMs",
        severity: "page",
        observed: `${p95}ms`,
        threshold: "> 5000",
      });
    } else if (p95 > 2000) {
      breaches.push({
        signal: "archive.sync p95 durationMs",
        severity: "warn",
        observed: `${p95}ms`,
        threshold: "> 2000",
      });
    }
  }

  // 5. destination_delivery.*.error, normalised to an hourly rate.
  const deliveryErrors = logs.filter((l) => /^destination_delivery\..*\.error$/.test(l.event)).length;
  if (deliveryErrors > 0) {
    const perHour = (deliveryErrors * 60) / windowMinutes;
    if (perHour > 50) {
      breaches.push({
        signal: "destination_delivery.*.error",
        severity: "page",
        observed: `${deliveryErrors} in ${windowMinutes}m (~${Math.round(perHour)}/h)`,
        threshold: "> 50 in 1 h",
      });
    } else if (perHour > 5) {
      breaches.push({
        signal: "destination_delivery.*.error",
        severity: "warn",
        observed: `${deliveryErrors} in ${windowMinutes}m (~${Math.round(perHour)}/h)`,
        threshold: "> 5 in 1 h",
      });
    }
  }

  return breaches;
}

export function worstSeverity(breaches: readonly Breach[]): Severity | null {
  if (breaches.some((b) => b.severity === "page")) return "page";
  if (breaches.length) return "warn";
  return null;
}
