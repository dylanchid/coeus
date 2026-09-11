import { migrateArchiveData } from "./archiveValidation.ts";
import type {
  ArchiveCollection,
  ArchiveData,
  ArchiveItem,
  SocialPost,
} from "./archiveTypes.ts";

export const ARCHIVE_SYNC_VERSION = 1 as const;

export type ArchiveEntityKind = "item" | "collection" | "socialPost";

export interface ArchiveEntityVersions {
  fields: Record<string, number>;
  deletedAtRevision?: number;
}

export interface ArchiveSyncSnapshot {
  syncVersion: typeof ARCHIVE_SYNC_VERSION;
  revision: number;
  generatedAt: string;
  archive: ArchiveData;
  entityVersions: Record<string, ArchiveEntityVersions>;
}

interface OperationBase {
  operationId: string;
  entityId: string;
}

export type ArchiveSyncOperation =
  | (OperationBase & {
      action: "upsert";
      entityKind: "item";
      changedFields: (keyof ArchiveItem)[];
      value: ArchiveItem;
    })
  | (OperationBase & {
      action: "upsert";
      entityKind: "collection";
      changedFields: (keyof ArchiveCollection)[];
      value: ArchiveCollection;
    })
  | (OperationBase & {
      action: "upsert";
      entityKind: "socialPost";
      changedFields: (keyof SocialPost)[];
      value: SocialPost;
    })
  | (OperationBase & {
      action: "delete";
      entityKind: ArchiveEntityKind;
    });

export interface ArchiveSyncBatch {
  syncVersion: typeof ARCHIVE_SYNC_VERSION;
  archiveId: string;
  clientId: string;
  baseRevision: number;
  operations: ArchiveSyncOperation[];
}

export interface ArchiveSyncConflict {
  operationId: string;
  entityKind: ArchiveEntityKind;
  entityId: string;
  fields: string[];
  reason: "field_changed" | "entity_deleted" | "delete_raced_with_update";
}

export interface ArchiveSyncResult {
  snapshot: ArchiveSyncSnapshot;
  acceptedOperationIds: string[];
  conflicts: ArchiveSyncConflict[];
}

export type ArchiveSyncBatchParseResult =
  | { ok: true; value: ArchiveSyncBatch }
  | { ok: false; error: string };

export type ArchiveSyncSnapshotParseResult =
  | { ok: true; value: ArchiveSyncSnapshot }
  | { ok: false; error: string };

const ENTITY_FIELDS = {
  item: [
    "id", "articleId", "title", "url", "sourceName", "topic", "summary",
    "author", "publishedAt", "savedAt", "state", "starred", "collectionIds",
    "tags", "note",
  ],
  collection: ["id", "name", "description", "visibility", "kind", "createdAt"],
  socialPost: [
    "id", "itemId", "excerpt", "commentary", "audience", "createdAt", "author",
  ],
} as const satisfies Record<ArchiveEntityKind, readonly string[]>;

function entityKey(kind: ArchiveEntityKind, id: string): string {
  return `${kind}:${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function entityIsValid(kind: ArchiveEntityKind, value: unknown): boolean {
  const archive: ArchiveData = {
    version: 1,
    items: kind === "item" ? [value as ArchiveItem] : [],
    collections: kind === "collection" ? [value as ArchiveCollection] : [],
    socialPosts: kind === "socialPost" ? [value as SocialPost] : [],
  };
  return migrateArchiveData(archive).valid;
}

/** Runtime validation for the body accepted by the future authenticated sync API. */
export function parseArchiveSyncBatch(raw: unknown): ArchiveSyncBatchParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Sync batch must be a JSON object" };
  const allowed = new Set(["syncVersion", "archiveId", "clientId", "baseRevision", "operations"]);
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, error: `Unknown sync batch field: ${unknown}` };
  if (raw.syncVersion !== ARCHIVE_SYNC_VERSION) {
    return { ok: false, error: `Unsupported sync version: ${String(raw.syncVersion)}` };
  }
  if (!isIdentifier(raw.archiveId) || !isIdentifier(raw.clientId)) {
    return { ok: false, error: "archiveId and clientId must be non-empty strings" };
  }
  if (!isRevision(raw.baseRevision)) {
    return { ok: false, error: "baseRevision must be a non-negative safe integer" };
  }
  if (!Array.isArray(raw.operations) || raw.operations.length > 500) {
    return { ok: false, error: "operations must be an array of at most 500 entries" };
  }

  const operationIds = new Set<string>();
  for (const [index, candidate] of raw.operations.entries()) {
    if (!isRecord(candidate)) return { ok: false, error: `Operation ${index} must be an object` };
    if (!isIdentifier(candidate.operationId) || operationIds.has(candidate.operationId)) {
      return { ok: false, error: `Operation ${index} has an invalid or duplicate operationId` };
    }
    operationIds.add(candidate.operationId);
    if (!isIdentifier(candidate.entityId)) {
      return { ok: false, error: `Operation ${index} has an invalid entityId` };
    }
    if (!(candidate.entityKind === "item" || candidate.entityKind === "collection" || candidate.entityKind === "socialPost")) {
      return { ok: false, error: `Operation ${index} has an invalid entityKind` };
    }
    const allowedOperationFields = candidate.action === "delete"
      ? new Set(["operationId", "action", "entityKind", "entityId"])
      : new Set(["operationId", "action", "entityKind", "entityId", "changedFields", "value"]);
    const unknownOperationField = Object.keys(candidate).find((key) => !allowedOperationFields.has(key));
    if (unknownOperationField) {
      return { ok: false, error: `Operation ${index} has unknown field: ${unknownOperationField}` };
    }
    if (candidate.action === "delete") continue;
    if (candidate.action !== "upsert") {
      return { ok: false, error: `Operation ${index} has an invalid action` };
    }
    if (!Array.isArray(candidate.changedFields) || candidate.changedFields.length === 0) {
      return { ok: false, error: `Operation ${index} must name changedFields` };
    }
    const validFields = new Set<string>(ENTITY_FIELDS[candidate.entityKind]);
    if (
      new Set(candidate.changedFields).size !== candidate.changedFields.length ||
      candidate.changedFields.some((field) => typeof field !== "string" || !validFields.has(field))
    ) {
      return { ok: false, error: `Operation ${index} contains invalid or duplicate changedFields` };
    }
    if (!entityIsValid(candidate.entityKind, candidate.value)) {
      return { ok: false, error: `Operation ${index} contains an invalid entity value` };
    }
    if ((candidate.value as Record<string, unknown>).id !== candidate.entityId) {
      return { ok: false, error: `Operation ${index} entityId does not match value.id` };
    }
  }
  return { ok: true, value: raw as unknown as ArchiveSyncBatch };
}

/** Validate a durable snapshot read from Postgres or imported from an export. */
export function parseArchiveSyncSnapshot(raw: unknown): ArchiveSyncSnapshotParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Sync snapshot must be a JSON object" };
  const allowed = new Set(["syncVersion", "revision", "generatedAt", "archive", "entityVersions"]);
  const unknown = Object.keys(raw).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, error: `Unknown sync snapshot field: ${unknown}` };
  if (raw.syncVersion !== ARCHIVE_SYNC_VERSION || !isRevision(raw.revision)) {
    return { ok: false, error: "Sync snapshot has an unsupported version or invalid revision" };
  }
  const revision = raw.revision;
  if (typeof raw.generatedAt !== "string" || Number.isNaN(Date.parse(raw.generatedAt))) {
    return { ok: false, error: "Sync snapshot has an invalid generatedAt timestamp" };
  }
  const archive = migrateArchiveData(raw.archive);
  if (!archive.valid) return { ok: false, error: "Sync snapshot contains invalid archive data" };
  if (!isRecord(raw.entityVersions)) {
    return { ok: false, error: "Sync snapshot has invalid entityVersions" };
  }
  for (const [key, candidate] of Object.entries(raw.entityVersions)) {
    if (!/^(item|collection|socialPost):.+/.test(key) || !isRecord(candidate) || !isRecord(candidate.fields)) {
      return { ok: false, error: `Sync snapshot has invalid versions for ${key}` };
    }
    if (!Object.values(candidate.fields).every((fieldRevision) => isRevision(fieldRevision) && fieldRevision <= revision)) {
      return { ok: false, error: `Sync snapshot has invalid field revisions for ${key}` };
    }
    if (
      candidate.deletedAtRevision !== undefined &&
      (!isRevision(candidate.deletedAtRevision) || candidate.deletedAtRevision > revision)
    ) {
      return { ok: false, error: `Sync snapshot has an invalid deletion revision for ${key}` };
    }
  }
  return {
    ok: true,
    value: { ...raw, archive: archive.data } as unknown as ArchiveSyncSnapshot,
  };
}

export function createInitialSyncSnapshot(
  archive: ArchiveData,
  generatedAt = new Date().toISOString()
): ArchiveSyncSnapshot {
  const validated = migrateArchiveData(archive);
  if (!validated.valid) throw new Error("Cannot create a sync snapshot from invalid archive data");
  const entityVersions: Record<string, ArchiveEntityVersions> = {};
  const register = (kind: ArchiveEntityKind, entity: { id: string }) => {
    entityVersions[entityKey(kind, entity.id)] = {
      fields: Object.fromEntries(ENTITY_FIELDS[kind].map((field) => [field, 0])),
    };
  };
  validated.data.items.forEach((item) => register("item", item));
  validated.data.collections.forEach((collection) => register("collection", collection));
  validated.data.socialPosts.forEach((post) => register("socialPost", post));
  return {
    syncVersion: ARCHIVE_SYNC_VERSION,
    revision: 0,
    generatedAt,
    archive: validated.data,
    entityVersions,
  };
}

function collectionForKind(archive: ArchiveData, kind: ArchiveEntityKind) {
  if (kind === "item") return archive.items;
  if (kind === "collection") return archive.collections;
  return archive.socialPosts;
}

/**
 * Apply one client batch using field-level optimistic concurrency.
 * Server state wins only for fields changed after baseRevision; unrelated fields merge.
 */
export function applyArchiveSyncBatch(
  current: ArchiveSyncSnapshot,
  batch: ArchiveSyncBatch,
  generatedAt = new Date().toISOString()
): ArchiveSyncResult {
  if (batch.syncVersion !== current.syncVersion) throw new Error("Sync version mismatch");
  if (batch.baseRevision > current.revision) throw new Error("baseRevision is ahead of the server");

  const archive = structuredClone(current.archive);
  const entityVersions = structuredClone(current.entityVersions);
  const serverEntityVersions = current.entityVersions;
  const conflicts: ArchiveSyncConflict[] = [];
  const acceptedOperationIds: string[] = [];
  const nextRevision = current.revision + 1;

  for (const operation of batch.operations) {
    const key = entityKey(operation.entityKind, operation.entityId);
    const versions = entityVersions[key] ?? { fields: {} };
    const serverVersions = serverEntityVersions[key] ?? { fields: {} };
    const entities = collectionForKind(archive, operation.entityKind) as { id: string }[];
    const index = entities.findIndex((entity) => entity.id === operation.entityId);

    if (operation.action === "delete") {
      const changedFields = Object.entries(serverVersions.fields)
        .filter(([, revision]) => revision > batch.baseRevision)
        .map(([field]) => field);
      if (changedFields.length) {
        conflicts.push({
          operationId: operation.operationId,
          entityKind: operation.entityKind,
          entityId: operation.entityId,
          fields: changedFields,
          reason: "delete_raced_with_update",
        });
        continue;
      }
      if (index >= 0) entities.splice(index, 1);
      versions.deletedAtRevision = nextRevision;
      entityVersions[key] = versions;
      acceptedOperationIds.push(operation.operationId);
      continue;
    }

    if (serverVersions.deletedAtRevision !== undefined && serverVersions.deletedAtRevision > batch.baseRevision) {
      conflicts.push({
        operationId: operation.operationId,
        entityKind: operation.entityKind,
        entityId: operation.entityId,
        fields: [...operation.changedFields] as string[],
        reason: "entity_deleted",
      });
      continue;
    }

    const conflictingFields = operation.changedFields.filter(
      (field) => (serverVersions.fields[String(field)] ?? 0) > batch.baseRevision
    );
    const acceptedFields = operation.changedFields.filter(
      (field) => !conflictingFields.includes(field)
    );
    if (conflictingFields.length) {
      conflicts.push({
        operationId: operation.operationId,
        entityKind: operation.entityKind,
        entityId: operation.entityId,
        fields: conflictingFields as string[],
        reason: "field_changed",
      });
    }
    if (!acceptedFields.length) continue;

    if (index < 0) {
      const requiredFields = ENTITY_FIELDS[operation.entityKind];
      if (!requiredFields.every((field) => operation.changedFields.includes(field as never))) {
        throw new Error(`New ${operation.entityKind} operations must include every field`);
      }
      entities.push(structuredClone(operation.value));
    } else {
      const target = entities[index] as unknown as Record<string, unknown>;
      const value = operation.value as unknown as Record<string, unknown>;
      for (const field of acceptedFields) target[String(field)] = structuredClone(value[String(field)]);
    }
    for (const field of acceptedFields) versions.fields[String(field)] = nextRevision;
    delete versions.deletedAtRevision;
    entityVersions[key] = versions;
    acceptedOperationIds.push(operation.operationId);
  }

  if (!acceptedOperationIds.length) {
    return { snapshot: current, acceptedOperationIds, conflicts };
  }
  const validated = migrateArchiveData(archive);
  if (!validated.valid) throw new Error("Sync operations produced an invalid archive");
  return {
    snapshot: {
      syncVersion: ARCHIVE_SYNC_VERSION,
      revision: nextRevision,
      generatedAt,
      archive: validated.data,
      entityVersions,
    },
    acceptedOperationIds,
    conflicts,
  };
}
