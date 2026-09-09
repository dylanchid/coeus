import type { ArchiveSyncSnapshot } from "./archiveSync.ts";
import type { ArchiveItem } from "./archiveTypes.ts";
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
    if (!delivery || revision > delivery.lastDeliveredRevision) {
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
 * Push every dirty item through an injected adapter. Stops the batch on the
 * first auth failure rather than retry-storming a destination whose token is
 * already known to be dead; the caller flips the destination to auth_error.
 */
export async function runDestinationDelivery(
  snapshot: ArchiveSyncSnapshot,
  deliveries: readonly DestinationDelivery[],
  adapter: DestinationAdapter,
  maxItems = Infinity
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = [];
  for (const action of computeDirtyItems(snapshot, deliveries).slice(0, maxItems)) {
    const result = action.kind === "upsert"
      ? await adapter.pushUpsert(action.item, action.existingExternalRef)
      : await adapter.pushDelete(action.itemId, action.existingExternalRef);
    outcomes.push({ itemId: action.itemId, action: action.kind, targetRevision: action.targetRevision, result });
    if (result.authError) break;
  }
  return outcomes;
}
