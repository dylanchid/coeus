import type { ArchiveSyncSnapshot } from "../archive/archiveSync.ts";
import type { ArchiveItem } from "../archive/archiveTypes.ts";
import type { DestinationAdapter, DestinationPushResult } from "./destinationAdapter.ts";
import type { DestinationDelivery } from "./destinations.ts";

export type DirtyDeliveryAction =
  | { kind: "upsert"; itemId: string; item: ArchiveItem; targetRevision: number; existingExternalRef: string | null }
  | { kind: "delete"; itemId: string; targetRevision: number; existingExternalRef: string };

function fieldRevision(fields: Record<string, number>): number {
  return Object.values(fields).reduce((max, value) => Math.max(max, value), 0);
}

/**
 * Diff a sync snapshot against a destination's delivery watermarks, reusing
 * ArchiveSyncSnapshot.entityVersions instead of a second per-field diff pass.
 * An item with no delivery row yet is always dirty (first push to a newly
 * connected destination), even when its own field revisions are still 0.
 */
export function computeDirtyItems(
  snapshot: ArchiveSyncSnapshot,
  deliveries: readonly DestinationDelivery[]
): DirtyDeliveryAction[] {
  const deliveryByItem = new Map(deliveries.map((delivery) => [delivery.itemId, delivery]));
  const itemsById = new Map(snapshot.archive.items.map((item) => [item.id, item]));
  const actions: DirtyDeliveryAction[] = [];

  for (const [key, versions] of Object.entries(snapshot.entityVersions)) {
    if (!key.startsWith("item:")) continue;
    const itemId = key.slice("item:".length);
    const delivery = deliveryByItem.get(itemId);

    if (versions.deletedAtRevision !== undefined) {
      if (delivery?.externalRef && versions.deletedAtRevision > delivery.lastDeliveredRevision) {
        actions.push({
          kind: "delete",
          itemId,
          targetRevision: versions.deletedAtRevision,
          existingExternalRef: delivery.externalRef,
        });
      }
      continue;
    }

    const item = itemsById.get(itemId);
    if (!item) continue;
    const revision = fieldRevision(versions.fields);
    if (!delivery || delivery.status !== "delivered" || revision > delivery.lastDeliveredRevision) {
      actions.push({
        kind: "upsert",
        itemId,
        item,
        targetRevision: revision,
        existingExternalRef: delivery?.externalRef ?? null,
      });
    }
  }

  return actions;
}

export interface DeliveryOutcome {
  itemId: string;
  action: "upsert" | "delete";
  targetRevision: number;
  result: DestinationPushResult;
}

/**
 * Push dirty items through an injected adapter. Stop on auth failure so a dead
 * token is not retried, and stop after a final transport exception so the
 * provider is not hammered before the next durable retry wake-up.
 */
export async function runDestinationDelivery(
  snapshot: ArchiveSyncSnapshot,
  deliveries: readonly DestinationDelivery[],
  adapter: DestinationAdapter,
  maxItems = Infinity
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = [];
  for (const action of computeDirtyItems(snapshot, deliveries).slice(0, maxItems)) {
    let result: DestinationPushResult;
    let transportFailure = false;
    try {
      result = action.kind === "upsert"
        ? await adapter.pushUpsert(action.item, action.existingExternalRef)
        : await adapter.pushDelete(action.itemId, action.existingExternalRef);
    } catch (error) {
      // A final network/timeout failure is still an item outcome. Recording it
      // lets the queue and UI distinguish a retryable push from a worker crash.
      transportFailure = true;
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    outcomes.push({ itemId: action.itemId, action: action.kind, targetRevision: action.targetRevision, result });
    if (result.authError || transportFailure) break;
  }
  return outcomes;
}
