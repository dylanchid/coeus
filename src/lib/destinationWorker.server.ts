import { computeDirtyItems, runDestinationDelivery } from "./destinationDelivery.ts";
import { logDelivery, newCorrelationId } from "./deliveryLog.ts";
import type { RetryOptions } from "./httpRetry.ts";
import { GitHubGitAdapter, type GitBatchAction } from "./obsidianGitAdapter.server.ts";
import { NotionAdapter } from "./notionAdapter.server.ts";
import { itemToObsidianNote } from "./archiveExport.ts";
import type { ArchiveSyncSnapshot } from "./archiveSync.ts";
import type { DestinationKind } from "./destinations.ts";
import type { DeliveryOutcomeInput, DestinationWorkerStore, WorkerDestination } from "./destinationsStore.server.ts";
import type { NotionConfig, ObsidianGitConfig } from "./destinations.ts";

export interface ArchiveSnapshotReader {
  snapshot(archiveId: string): Promise<ArchiveSyncSnapshot>;
}

/** Per-item delivery counts for one destination's run. */
export interface DeliveryCounts {
  delivered: number;
  failed: number;
  authError: boolean;
}

const EMPTY_COUNTS: DeliveryCounts = { delivered: 0, failed: 0, authError: false };
/** Bound an invocation so a first-connect cannot outlive its serverless budget. */
export const MAX_ITEMS_PER_TICK = 100;

async function deliverObsidianGit(
  target: WorkerDestination,
  snapshot: ArchiveSyncSnapshot,
  store: DestinationWorkerStore,
  fetcher: typeof fetch,
  retryOptions: RetryOptions
): Promise<DeliveryCounts> {
  const config = target.config as ObsidianGitConfig;
  const deliveries = await store.deliveries(target.ownerId, target.kind);
  const actions = computeDirtyItems(snapshot, deliveries).slice(0, MAX_ITEMS_PER_TICK);
  if (!actions.length) return { ...EMPTY_COUNTS };

  const adapter = new GitHubGitAdapter(config, target.secret, fetcher, retryOptions);
  const batch: GitBatchAction[] = actions.map((action) =>
    action.kind === "upsert"
      ? { itemId: action.itemId, kind: "upsert", path: adapter.path(action.itemId), content: itemToObsidianNote(action.item) }
      : { itemId: action.itemId, kind: "delete", path: adapter.path(action.itemId) }
  );
  const outcomes = await adapter.pushBatch(batch);

  const counts: DeliveryCounts = { delivered: 0, failed: 0, authError: false };
  const outcomeInputs: DeliveryOutcomeInput[] = [];
  for (const action of actions) {
    const result = outcomes.get(action.itemId);
    if (!result) continue;
    if (result.authError) counts.authError = true;
    if (result.ok) counts.delivered += 1;
    else counts.failed += 1;
    outcomeInputs.push({
      itemId: action.itemId,
      externalRef: result.externalRef ?? null,
      deliveredRevision: action.targetRevision,
      status: result.ok ? "delivered" : result.authError ? "failed_auth" : "failed_retryable",
      httpStatus: result.httpStatus ?? null,
      error: result.error ?? null,
    });
  }
  await store.recordOutcomes(target.ownerId, target.kind, outcomeInputs);
  if (counts.authError) await store.markStatus(target.ownerId, target.kind, "auth_error");
  return counts;
}

/**
 * Notion pushes one page per item (no batch API), so this reuses the pure
 * runDestinationDelivery loop, which already stops at the first auth
 * failure instead of retry-storming a destination whose token is dead.
 */
async function deliverNotion(
  target: WorkerDestination,
  snapshot: ArchiveSyncSnapshot,
  store: DestinationWorkerStore,
  fetcher: typeof fetch,
  retryOptions: RetryOptions
): Promise<DeliveryCounts> {
  const deliveries = await store.deliveries(target.ownerId, target.kind);
  const adapter = new NotionAdapter(target.config as NotionConfig, target.secret, fetcher, retryOptions);
  const outcomes = await runDestinationDelivery(snapshot, deliveries, adapter, MAX_ITEMS_PER_TICK);

  const counts: DeliveryCounts = { delivered: 0, failed: 0, authError: false };
  const outcomeInputs: DeliveryOutcomeInput[] = [];
  for (const outcome of outcomes) {
    if (outcome.result.authError) counts.authError = true;
    if (outcome.result.ok) counts.delivered += 1;
    else counts.failed += 1;
    outcomeInputs.push({
      itemId: outcome.itemId,
      externalRef: outcome.result.externalRef ?? null,
      deliveredRevision: outcome.targetRevision,
      status: outcome.result.ok ? "delivered" : outcome.result.authError ? "failed_auth" : "failed_retryable",
      httpStatus: outcome.result.httpStatus ?? null,
      error: outcome.result.error ?? null,
    });
  }
  await store.recordOutcomes(target.ownerId, target.kind, outcomeInputs);
  if (counts.authError) await store.markStatus(target.ownerId, target.kind, "auth_error");
  return counts;
}

/**
 * One destination's delivery for one tick, diffed against its stored
 * per-item watermarks so a tick only pushes what changed since the last
 * successful delivery.
 */
export async function runDeliveryForDestination(
  target: WorkerDestination,
  reader: ArchiveSnapshotReader,
  store: DestinationWorkerStore,
  fetcher: typeof fetch = fetch,
  retryOptions: RetryOptions = {}
): Promise<DeliveryCounts> {
  const snapshot = await reader.snapshot(target.archiveId);
  if (target.kind === "obsidian_git") {
    return deliverObsidianGit(target, snapshot, store, fetcher, retryOptions);
  }
  if (target.kind === "notion") {
    return deliverNotion(target, snapshot, store, fetcher, retryOptions);
  }
  return { ...EMPTY_COUNTS };
}

export interface DestinationDeliverySummary {
  ownerId: string;
  kind: DestinationKind;
  /** delivered: at least one push, no failures. skipped: another run held the lease or the rate window was open. failed: an exception or a failed push. */
  status: "delivered" | "noop" | "skipped" | "failed";
  delivered: number;
  failed: number;
  authError: boolean;
  error?: string;
}

export interface WorkerTickResult {
  correlationId: string;
  processed: number;
  skipped: number;
  failures: { ownerId: string; kind: string; error: string }[];
  results: DestinationDeliverySummary[];
}

export interface WorkerTickOptions {
  /** Scope to one owner (the post-sync hook); omit for the cron sweep. */
  ownerId?: string;
  fetcher?: typeof fetch;
  retryOptions?: RetryOptions;
  /** How long a run may hold a destination before the lease is considered abandoned. */
  leaseTtlSeconds?: number;
  /** Minimum gap between delivery runs for one destination — the cross-invocation rate limit. */
  minIntervalSeconds?: number;
  correlationId?: string;
}

/**
 * Runs one delivery pass. Every destination is guarded by a durable lease
 * (`acquire_destination_delivery_lease`) that provides both cross-instance
 * mutual exclusion — so two overlapping runs can't both create the same remote
 * page — and a cross-invocation rate limit via its minimum-interval check. The
 * pass never throws: a failure for one destination is captured in `results` and
 * `failures` and the sweep moves on. Callers (the post-sync `after()` hook, the
 * manual sync route, the cron route) log the returned summary; archive sync is
 * never blocked or failed by delivery.
 */
export async function runDestinationWorkerTick(
  reader: ArchiveSnapshotReader,
  store: DestinationWorkerStore,
  options: WorkerTickOptions = {}
): Promise<WorkerTickResult> {
  const correlationId = options.correlationId ?? newCorrelationId();
  const leaseTtlSeconds = options.leaseTtlSeconds ?? 300;
  const minIntervalSeconds = options.minIntervalSeconds ?? 30;
  const result: WorkerTickResult = { correlationId, processed: 0, skipped: 0, failures: [], results: [] };

  let targets: WorkerDestination[];
  try {
    targets = await store.activeDestinations(options.ownerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDelivery("destination_delivery.enumerate.error", { correlationId, ownerId: options.ownerId ?? null, error: message });
    result.failures.push({ ownerId: options.ownerId ?? "*", kind: "*", error: message });
    return result;
  }

  for (const target of targets) {
    const leaseToken = newCorrelationId();
    let acquired = false;
    try {
      acquired = await store.acquireDeliveryLease(
        target.ownerId,
        target.kind,
        leaseToken,
        leaseTtlSeconds,
        minIntervalSeconds
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failures.push({ ownerId: target.ownerId, kind: target.kind, error: message });
      result.results.push({ ownerId: target.ownerId, kind: target.kind, status: "failed", delivered: 0, failed: 0, authError: false, error: message });
      logDelivery("destination_delivery.lease.error", { correlationId, ownerId: target.ownerId, kind: target.kind, error: message });
      continue;
    }

    if (!acquired) {
      result.skipped += 1;
      result.results.push({ ownerId: target.ownerId, kind: target.kind, status: "skipped", delivered: 0, failed: 0, authError: false });
      logDelivery("destination_delivery.skipped", { correlationId, ownerId: target.ownerId, kind: target.kind });
      continue;
    }

    let summary: DestinationDeliverySummary;
    try {
      const counts = await runDeliveryForDestination(target, reader, store, options.fetcher, options.retryOptions);
      const status = counts.failed > 0 ? "failed" : counts.delivered > 0 ? "delivered" : "noop";
      summary = { ownerId: target.ownerId, kind: target.kind, status, ...counts };
      result.processed += 1;
      if (counts.failed > 0) {
        result.failures.push({ ownerId: target.ownerId, kind: target.kind, error: `${counts.failed} item(s) failed to deliver` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary = { ownerId: target.ownerId, kind: target.kind, status: "failed", delivered: 0, failed: 0, authError: false, error: message };
      result.failures.push({ ownerId: target.ownerId, kind: target.kind, error: message });
    }

    result.results.push(summary);
    logDelivery(summary.status === "failed" ? "destination_delivery.destination.error" : "destination_delivery.destination", {
      correlationId,
      ownerId: target.ownerId,
      kind: target.kind,
      status: summary.status,
      delivered: summary.delivered,
      failed: summary.failed,
      authError: summary.authError,
      error: summary.error ?? null,
    });

    try {
      await store.releaseDeliveryLease(target.ownerId, target.kind, leaseToken, {
        correlationId,
        status: summary.status,
        delivered: summary.delivered,
        failed: summary.failed,
        authError: summary.authError,
        at: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logDelivery("destination_delivery.release.error", { correlationId, ownerId: target.ownerId, kind: target.kind, error: message });
    }
  }

  logDelivery("destination_delivery.tick", {
    correlationId,
    ownerId: options.ownerId ?? null,
    processed: result.processed,
    skipped: result.skipped,
    failures: result.failures.length,
  });
  return result;
}
