import type { ArchiveSyncSnapshot } from "./archiveSync.ts";

/**
 * Per-account archive and request budgets, enforced at the authoritative
 * server/database boundary (the service-role sync store and the
 * `commit_archive_sync` / rate-limit RPCs). These are deliberately generous
 * pre-launch ceilings meant to stop storage amplification and pathological
 * latency, not to shape normal use; tune the constants as real usage lands.
 */
export const ARCHIVE_BUDGET = {
  /** Live entity counts in a committed snapshot. */
  maxItems: 5_000,
  maxCollections: 2_000,
  maxSocialPosts: 5_000,
  /** Serialized size of the whole snapshot JSON. */
  maxSnapshotBytes: 8 * 1024 * 1024,
  /** Any single string value inside an entity. */
  maxStringFieldChars: 20_000,
  /** Operations accepted in one sync batch (also enforced by parseArchiveSyncBatch). */
  maxOperationsPerBatch: 500,
  /** Durable per-account sync rate limit. */
  syncRate: { max: 60, windowSeconds: 300 },
  /**
   * Revision retention: keep at least the most recent `keepRevisions` and
   * everything from the last `keepDays`, whichever is larger. This preserves
   * the recovery window promised by the archive recovery/export feature.
   */
  retention: { keepRevisions: 50, keepDays: 30 },
} as const;

export type ArchiveBudgetCode =
  | "items"
  | "collections"
  | "socialPosts"
  | "snapshot_bytes"
  | "string_field"
  | "operations";

export interface ArchiveBudgetViolation {
  code: ArchiveBudgetCode;
  message: string;
  limit: number;
  actual: number;
}

function firstOverlongString(entities: readonly Record<string, unknown>[], limit: number): { path: string; length: number } | null {
  for (const entity of entities) {
    const entityId = typeof entity.id === "string" ? entity.id : "?";
    for (const [key, value] of Object.entries(entity)) {
      if (typeof value === "string" && value.length > limit) {
        return { path: `${entityId}.${key}`, length: value.length };
      }
    }
  }
  return null;
}

/**
 * Check a would-be-committed snapshot against the per-account budget. Returns
 * the first violation, or `null` when the snapshot is within budget.
 */
export function checkArchiveBudget(
  snapshot: ArchiveSyncSnapshot,
  budget: typeof ARCHIVE_BUDGET = ARCHIVE_BUDGET
): ArchiveBudgetViolation | null {
  const { items, collections, socialPosts } = snapshot.archive;

  if (items.length > budget.maxItems) {
    return { code: "items", message: `Archive exceeds the ${budget.maxItems}-item limit`, limit: budget.maxItems, actual: items.length };
  }
  if (collections.length > budget.maxCollections) {
    return { code: "collections", message: `Archive exceeds the ${budget.maxCollections}-collection limit`, limit: budget.maxCollections, actual: collections.length };
  }
  if (socialPosts.length > budget.maxSocialPosts) {
    return { code: "socialPosts", message: `Archive exceeds the ${budget.maxSocialPosts}-post limit`, limit: budget.maxSocialPosts, actual: socialPosts.length };
  }

  const overlong =
    firstOverlongString(items as unknown as Record<string, unknown>[], budget.maxStringFieldChars) ??
    firstOverlongString(collections as unknown as Record<string, unknown>[], budget.maxStringFieldChars) ??
    firstOverlongString(socialPosts as unknown as Record<string, unknown>[], budget.maxStringFieldChars);
  if (overlong) {
    return {
      code: "string_field",
      message: `Field ${overlong.path} exceeds the ${budget.maxStringFieldChars}-character limit`,
      limit: budget.maxStringFieldChars,
      actual: overlong.length,
    };
  }

  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  if (bytes > budget.maxSnapshotBytes) {
    return { code: "snapshot_bytes", message: `Archive snapshot exceeds ${budget.maxSnapshotBytes} bytes`, limit: budget.maxSnapshotBytes, actual: bytes };
  }

  return null;
}
