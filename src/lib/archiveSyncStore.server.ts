import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyArchiveSyncBatch,
  createInitialSyncSnapshot,
  parseArchiveSyncSnapshot,
  type ArchiveSyncBatch,
  type ArchiveSyncConflict,
  type ArchiveSyncResult,
  type ArchiveSyncSnapshot,
} from "./archiveSync.ts";
import type { ArchiveData } from "./archiveTypes.ts";

const EMPTY_ARCHIVE: ArchiveData = {
  version: 1,
  items: [],
  collections: [],
  socialPosts: [],
};

const MAX_COMMIT_ATTEMPTS = 3;

interface StoredArchive {
  archiveId: string;
  snapshot: ArchiveSyncSnapshot;
}

interface StoredOperation {
  operation_id: string;
  accepted: boolean;
  conflicts: ArchiveSyncConflict[];
}

interface CommitResult {
  committed: boolean;
  current_revision: number | null;
  snapshot: unknown;
}

export interface ArchiveSyncStore {
  getOrCreate(ownerId: string): Promise<StoredArchive>;
  sync(ownerId: string, batch: ArchiveSyncBatch): Promise<StoredArchive & ArchiveSyncResult>;
}

export class ArchiveNotFoundError extends Error {}
export class ArchiveRevisionAheadError extends Error {
  readonly current: StoredArchive;

  constructor(current: StoredArchive) {
    super("Client base revision is ahead of the server");
    this.current = current;
  }
}
export class ArchiveCommitContentionError extends Error {}

function checkedSnapshot(raw: unknown): ArchiveSyncSnapshot {
  const parsed = parseArchiveSyncSnapshot(raw);
  if (!parsed.ok) throw new Error(`Stored archive is corrupt: ${parsed.error}`);
  return parsed.value;
}

export class SupabaseArchiveSyncStore implements ArchiveSyncStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /** Structurally satisfies destinationWorker.server.ts's ArchiveSnapshotReader without adding to the ArchiveSyncStore interface. */
  async snapshot(archiveId: string): Promise<ArchiveSyncSnapshot> {
    const { data: archive, error: archiveError } = await this.supabase
      .from("archives")
      .select("current_revision")
      .eq("id", archiveId)
      .single();
    if (archiveError) throw archiveError;
    const row = archive as unknown as { current_revision: number };
    const { data: revision, error: revisionError } = await this.supabase
      .from("archive_revisions")
      .select("snapshot")
      .eq("archive_id", archiveId)
      .eq("revision", row.current_revision)
      .single();
    if (revisionError) throw revisionError;
    return checkedSnapshot((revision as unknown as { snapshot: unknown }).snapshot);
  }

  async getOrCreate(ownerId: string): Promise<StoredArchive> {
    const { data: archive, error: archiveError } = await this.supabase
      .from("archives")
      .select("id,current_revision")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (archiveError) throw archiveError;

    if (!archive) {
      const initial = createInitialSyncSnapshot(EMPTY_ARCHIVE);
      const { data, error } = await this.supabase
        .rpc("initialize_archive", { p_owner_id: ownerId, p_snapshot: initial })
        .single();
      if (error) throw error;
      const initialized = data as unknown as {
        archive_id: string;
        current_revision: number;
        snapshot: unknown;
      };
      return { archiveId: initialized.archive_id, snapshot: checkedSnapshot(initialized.snapshot) };
    }

    const row = archive as unknown as { id: string; current_revision: number };
    const { data: revision, error: revisionError } = await this.supabase
      .from("archive_revisions")
      .select("snapshot")
      .eq("archive_id", row.id)
      .eq("revision", row.current_revision)
      .single();
    if (revisionError) throw revisionError;
    return {
      archiveId: row.id,
      snapshot: checkedSnapshot((revision as unknown as { snapshot: unknown }).snapshot),
    };
  }

  async sync(ownerId: string, batch: ArchiveSyncBatch): Promise<StoredArchive & ArchiveSyncResult> {
    for (let attempt = 0; attempt < MAX_COMMIT_ATTEMPTS; attempt += 1) {
      const current = await this.getOrCreate(ownerId);
      if (batch.archiveId !== current.archiveId) throw new ArchiveNotFoundError("Archive not found");
      if (batch.baseRevision > current.snapshot.revision) {
        throw new ArchiveRevisionAheadError(current);
      }

      const stored = await this.storedOperations(current.archiveId, batch.operations.map((op) => op.operationId));
      const storedById = new Map(stored.map((operation) => [operation.operation_id, operation]));
      const pendingOperations = batch.operations.filter((operation) => !storedById.has(operation.operationId));
      const pendingBatch = { ...batch, operations: pendingOperations };
      const reduced = applyArchiveSyncBatch(current.snapshot, pendingBatch);
      const pendingLogs = pendingOperations.map((operation) => ({
        operationId: operation.operationId,
        clientId: batch.clientId,
        baseRevision: batch.baseRevision,
        operation,
        accepted: reduced.acceptedOperationIds.includes(operation.operationId),
        conflicts: reduced.conflicts.filter((conflict) => conflict.operationId === operation.operationId),
      }));

      if (!pendingOperations.length) {
        return {
          ...current,
          acceptedOperationIds: stored.filter((operation) => operation.accepted).map((operation) => operation.operation_id),
          conflicts: stored.flatMap((operation) => operation.conflicts),
        };
      }

      const { data, error } = await this.supabase
        .rpc("commit_archive_sync", {
          p_owner_id: ownerId,
          p_archive_id: current.archiveId,
          p_expected_revision: current.snapshot.revision,
          p_snapshot: reduced.snapshot,
          p_operations: pendingLogs,
        })
        .single();
      if (error) throw error;
      const committed = data as unknown as CommitResult;
      if (!committed.committed) {
        if (committed.current_revision === null) throw new ArchiveNotFoundError("Archive not found");
        continue;
      }
      return {
        archiveId: current.archiveId,
        snapshot: checkedSnapshot(committed.snapshot),
        acceptedOperationIds: [
          ...stored.filter((operation) => operation.accepted).map((operation) => operation.operation_id),
          ...reduced.acceptedOperationIds,
        ],
        conflicts: [...stored.flatMap((operation) => operation.conflicts), ...reduced.conflicts],
      };
    }
    throw new ArchiveCommitContentionError("Archive changed too frequently; retry the batch");
  }

  private async storedOperations(archiveId: string, operationIds: string[]): Promise<StoredOperation[]> {
    if (!operationIds.length) return [];
    const { data, error } = await this.supabase
      .from("archive_operations")
      .select("operation_id,accepted,conflicts")
      .eq("archive_id", archiveId)
      .in("operation_id", operationIds);
    if (error) throw error;
    return (data ?? []) as unknown as StoredOperation[];
  }
}
