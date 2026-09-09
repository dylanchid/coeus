/**
 * The `archive_storage_stats` total-`snapshot_bytes` growth row from the README
 * "Observability › Alerting" table, as a pure evaluator. Unlike the log-based
 * signals in {@link ./logThresholds}, this one needs persisted state: the
 * `capture_storage_growth()` RPC (20260908120000_storage_growth_snapshots.sql)
 * appends a reading and hands back the previous one, and
 * `scripts/storage-growth.mts` runs this on the pair every week.
 *
 * Growth is normalised to a 7-day rate, so a capture that lands early or late
 * (GitHub's scheduler is best-effort) still compares against the same
 * threshold. Warn at > 25%/week, page at > 100%/week — matching the table.
 */
import type { Breach } from "./logThresholds.ts";

export interface StorageReading {
  currentBytes: number;
  currentAt: string | Date;
  /** Null on the very first capture — nothing to diff against yet. */
  previousBytes: number | null;
  previousAt: string | Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_WEEKLY_GROWTH = 0.25;
const PAGE_WEEKLY_GROWTH = 1.0;

/**
 * A capture less than this far from the previous one is too short a baseline to
 * annualise into a weekly rate without wild swings, so it is skipped.
 */
const MIN_ELAPSED_DAYS = 1;

function toMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function evaluateStorageGrowth(reading: StorageReading): Breach | null {
  const { currentBytes, previousBytes } = reading;

  // First run, a wiped baseline, or a shrink (retention pruning ran): nothing
  // to alert on.
  if (previousBytes === null || reading.previousAt === null) return null;
  if (previousBytes <= 0 || currentBytes <= previousBytes) return null;

  const elapsedDays = (toMs(reading.currentAt) - toMs(reading.previousAt)) / DAY_MS;
  if (!Number.isFinite(elapsedDays) || elapsedDays < MIN_ELAPSED_DAYS) return null;

  const rawGrowth = currentBytes / previousBytes - 1;
  const weeklyGrowth = rawGrowth * (7 / elapsedDays);

  const observed =
    `+${pct(weeklyGrowth)}/week ` +
    `(${previousBytes} → ${currentBytes} bytes over ${elapsedDays.toFixed(1)}d)`;

  if (weeklyGrowth > PAGE_WEEKLY_GROWTH) {
    return { signal: "archive_storage_stats snapshot_bytes growth", severity: "page", observed, threshold: "> 100%/week" };
  }
  if (weeklyGrowth > WARN_WEEKLY_GROWTH) {
    return { signal: "archive_storage_stats snapshot_bytes growth", severity: "warn", observed, threshold: "> 25%/week" };
  }
  return null;
}
