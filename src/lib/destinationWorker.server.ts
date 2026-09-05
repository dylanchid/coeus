import "server-only";

import { computeDirtyItems, runDestinationDelivery } from "./destinationDelivery.ts";
import { GitHubGitAdapter, type GitBatchAction } from "./obsidianGitAdapter.server.ts";
import { NotionAdapter } from "./notionAdapter.server.ts";
import { itemToObsidianNote } from "./archiveExport.ts";
import type { ArchiveSyncSnapshot } from "./archiveSync.ts";
import type { DestinationWorkerStore, WorkerDestination } from "./destinationsStore.server.ts";
import type { NotionConfig, ObsidianGitConfig } from "./destinations.ts";
import { FixedWindowBudget } from "./fixedWindowBudget.ts";

export interface ArchiveSnapshotReader {
  snapshot(archiveId: string): Promise<ArchiveSyncSnapshot>;
}

async function deliverObsidianGit(
  target: WorkerDestination,
  snapshot: ArchiveSyncSnapshot,
  store: DestinationWorkerStore,
  fetcher: typeof fetch
): Promise<void> {
  const config = target.config as ObsidianGitConfig;
  const deliveries = await store.deliveries(target.ownerId, target.kind);
  const actions = computeDirtyItems(snapshot, deliveries);
  if (!actions.length) return;

  const adapter = new GitHubGitAdapter(config, target.secret, fetcher);
  const batch: GitBatchAction[] = actions.map((action) =>
    action.kind === "upsert"
      ? { itemId: action.itemId, kind: "upsert", path: adapter.path(action.itemId), content: itemToObsidianNote(action.item) }
      : { itemId: action.itemId, kind: "delete", path: adapter.path(action.itemId) }
  );
  const outcomes = await adapter.pushBatch(batch);

  let authFailed = false;
  for (const action of actions) {
    const result = outcomes.get(action.itemId);
    if (!result) continue;
    if (result.authError) authFailed = true;
    await store.recordOutcome(target.ownerId, target.kind, {
      itemId: action.itemId,
      externalRef: result.externalRef ?? null,
      deliveredRevision: action.targetRevision,
      status: result.ok ? "delivered" : result.authError ? "failed_auth" : "failed_retryable",
      httpStatus: result.httpStatus ?? null,
      error: result.error ?? null,
    });
  }
  if (authFailed) await store.markStatus(target.ownerId, target.kind, "auth_error");
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
  fetcher: typeof fetch
): Promise<void> {
  const deliveries = await store.deliveries(target.ownerId, target.kind);
  const adapter = new NotionAdapter(target.config as NotionConfig, target.secret, fetcher);
  const outcomes = await runDestinationDelivery(snapshot, deliveries, adapter);

  let authFailed = false;
  for (const outcome of outcomes) {
    if (outcome.result.authError) authFailed = true;
    await store.recordOutcome(target.ownerId, target.kind, {
      itemId: outcome.itemId,
      externalRef: outcome.result.externalRef ?? null,
      deliveredRevision: outcome.targetRevision,
      status: outcome.result.ok ? "delivered" : outcome.result.authError ? "failed_auth" : "failed_retryable",
      httpStatus: outcome.result.httpStatus ?? null,
      error: outcome.result.error ?? null,
    });
  }
  if (authFailed) await store.markStatus(target.ownerId, target.kind, "auth_error");
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
  fetcher: typeof fetch = fetch
): Promise<void> {
  const snapshot = await reader.snapshot(target.archiveId);
  if (target.kind === "obsidian_git") {
    await deliverObsidianGit(target, snapshot, store, fetcher);
  } else if (target.kind === "notion") {
    await deliverNotion(target, snapshot, store, fetcher);
  }
}

export interface WorkerTickResult {
  processed: number;
  skipped: number;
  failures: { ownerId: string; kind: string; error: string }[];
}

/**
 * Runs one delivery pass. Pass `ownerId` to scope it to a single owner (the
 * post-sync `after()` hook); omit it for the cron tick, which sweeps every
 * active destination. `budget` rate-limits per (archiveId, kind) so a flurry
 * of syncs can't retry-storm a slow or misbehaving third party.
 */
export async function runDestinationWorkerTick(
  reader: ArchiveSnapshotReader,
  store: DestinationWorkerStore,
  options: { ownerId?: string; budget?: FixedWindowBudget; fetcher?: typeof fetch } = {}
): Promise<WorkerTickResult> {
  const budget = options.budget ?? new FixedWindowBudget(30, 60 * 60 * 1000);
  const targets = await store.activeDestinations(options.ownerId);
  const result: WorkerTickResult = { processed: 0, skipped: 0, failures: [] };

  for (const target of targets) {
    const decision = budget.consume(`${target.archiveId}:${target.kind}`, 1);
    if (!decision.allowed) {
      result.skipped += 1;
      continue;
    }
    try {
      await runDeliveryForDestination(target, reader, store, options.fetcher);
      result.processed += 1;
    } catch (error) {
      result.failures.push({ ownerId: target.ownerId, kind: target.kind, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
