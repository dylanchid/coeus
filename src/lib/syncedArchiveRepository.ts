import { parseArchiveSyncSnapshot, type ArchiveEntityKind, type ArchiveSyncConflict, type ArchiveSyncOperation, type ArchiveSyncSnapshot } from "./archiveSync.ts";
import type { ArchiveData, ArchiveRepository } from "./archiveTypes.ts";
import { LOCAL_ARCHIVE_STORAGE_KEY, LocalStorageArchiveRepository } from "./localArchiveRepository.ts";

const QUEUE_KEY = "bareaga.archive.sync-queue.v1";
const STATE_KEY = "bareaga.archive.sync-state.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;
interface QueueState { clientId: string; archiveId?: string; base?: ArchiveSyncSnapshot; operations: ArchiveSyncOperation[]; conflicts: ArchiveSyncConflict[]; }

export type ArchiveSyncStatus = "local" | "syncing" | "synced" | "offline" | "conflicted";
export interface ArchiveSyncState { status: ArchiveSyncStatus; pending: number; conflicts: number; }

function storage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function entities(data: ArchiveData, kind: ArchiveEntityKind): { id: string }[] {
  return kind === "item" ? data.items : kind === "collection" ? data.collections : data.socialPosts;
}

function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after[key]));
}

function operationsForChange(before: ArchiveData, after: ArchiveData): ArchiveSyncOperation[] {
  const result: ArchiveSyncOperation[] = [];
  for (const kind of ["item", "collection", "socialPost"] as const) {
    const previous = new Map(entities(before, kind).map((entity) => [entity.id, entity]));
    const next = new Map(entities(after, kind).map((entity) => [entity.id, entity]));
    for (const [entityId, value] of next) {
      const prior = previous.get(entityId) as Record<string, unknown> | undefined;
      const fields = changedFields(prior, value as Record<string, unknown>);
      if (!fields.length) continue;
      result.push({ operationId: id("op"), action: "upsert", entityKind: kind, entityId, changedFields: fields as never, value: structuredClone(value) } as unknown as ArchiveSyncOperation);
    }
    for (const entityId of previous.keys()) if (!next.has(entityId)) result.push({ operationId: id("op"), action: "delete", entityKind: kind, entityId });
  }
  return result;
}

function applyOperations(base: ArchiveData, operations: ArchiveSyncOperation[]): ArchiveData {
  const archive = structuredClone(base);
  for (const operation of operations) {
    const collection = entities(archive, operation.entityKind) as Record<string, unknown>[];
    const index = collection.findIndex((entity) => entity.id === operation.entityId);
    if (operation.action === "delete") { if (index >= 0) collection.splice(index, 1); continue; }
    if (index < 0) collection.push(structuredClone(operation.value) as unknown as Record<string, unknown>);
    else for (const field of operation.changedFields) collection[index][String(field)] = structuredClone((operation.value as unknown as Record<string, unknown>)[String(field)]);
  }
  return archive;
}

function empty(data: ArchiveData): boolean { return !data.items.length && !data.collections.length && !data.socialPosts.length; }

/** Local-first ArchiveRepository that queues authenticated API synchronization after every durable local save. */
export class SyncedArchiveRepository implements ArchiveRepository {
  private readonly local: LocalStorageArchiveRepository;
  private readonly store?: StorageLike;
  private queue: QueueState;
  private last?: ArchiveData;
  private status: ArchiveSyncStatus = "local";
  private running?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(local = new LocalStorageArchiveRepository(), persistentStorage = storage()) {
    this.local = local; this.store = persistentStorage;
    this.queue = this.readQueue();
  }

  async load(): Promise<ArchiveData> {
    const local = await this.local.load(); this.last = local;
    void this.synchronize();
    return local;
  }

  async save(data: ArchiveData): Promise<void> {
    const before = this.last ?? await this.local.load();
    await this.local.save(data); this.last = data;
    const operations = operationsForChange(before, data);
    if (operations.length) { this.queue.operations.push(...operations); this.persistQueue(); this.publishState(); }
    void this.synchronize();
  }

  subscribe(listener: (data: ArchiveData) => void): () => void { return this.local.subscribe(listener); }
  getSyncStatus(): ArchiveSyncStatus { return this.status; }
  getConflicts(): readonly ArchiveSyncConflict[] { return this.queue.conflicts; }
  getSyncState(): ArchiveSyncState { return { status: this.status, pending: this.queue.operations.length, conflicts: this.queue.conflicts.length }; }
  async replaceFromServer(archiveId: string, base: ArchiveSyncSnapshot): Promise<void> {
    this.queue.archiveId = archiveId;
    this.queue.base = base;
    this.queue.operations = [];
    this.persistQueue();
    await this.local.save(base.archive);
    this.last = base.archive;
    this.status = this.queue.conflicts.length ? "conflicted" : "synced";
    this.publishState();
  }

  private readQueue(): QueueState {
    try {
      const saved = JSON.parse(this.store?.getItem(QUEUE_KEY) ?? "null") as Partial<QueueState> | null;
      if (saved?.clientId && Array.isArray(saved.operations) && Array.isArray(saved.conflicts)) return saved as QueueState;
    } catch { /* corrupt transient queue is replaced; the archive itself remains intact */ }
    return { clientId: id("client"), operations: [], conflicts: [] };
  }
  private persistQueue(): void { this.store?.setItem(QUEUE_KEY, JSON.stringify(this.queue)); }
  private publishState(): void {
    const state = this.getSyncState();
    this.store?.setItem(STATE_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("bareaga:archive-sync", { detail: state }));
  }

  private async synchronize(): Promise<void> {
    if (this.running || (typeof navigator !== "undefined" && navigator.onLine === false)) { if (!this.running) { this.status = "offline"; this.publishState(); } return; }
    this.running = this.syncLoop().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async syncLoop(): Promise<void> {
    this.status = "syncing"; this.publishState();
    try {
      const response = await fetch("/api/archive", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) { this.status = "local"; this.publishState(); return; }
      if (!response.ok) throw new Error(`Archive read failed (${response.status})`);
      const remote = await response.json() as { archiveId: string; snapshot: unknown };
      const parsed = parseArchiveSyncSnapshot(remote.snapshot); if (!parsed.ok) throw new Error(parsed.error);
      this.queue.archiveId = remote.archiveId; this.queue.base = parsed.value;
      const currentLocal = this.last ?? await this.local.load();
      // First account connection uploads a local archive as operations; it never overwrites a remote snapshot.
      if (!this.queue.operations.length && !empty(currentLocal)) this.queue.operations.push(...operationsForChange(parsed.value.archive, currentLocal));
      while (this.queue.operations.length) {
        const base = this.queue.base;
        const body = { syncVersion: 1, archiveId: this.queue.archiveId, clientId: this.queue.clientId, baseRevision: base.revision, operations: this.queue.operations.slice(0, 500) };
        const synced = await fetch("/api/archive/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!synced.ok) throw new Error(`Archive sync failed (${synced.status})`);
        const result = await synced.json() as { snapshot: unknown; acceptedOperationIds: string[]; conflicts: ArchiveSyncConflict[] };
        const next = parseArchiveSyncSnapshot(result.snapshot); if (!next.ok) throw new Error(next.error);
        const processed = new Set([...result.acceptedOperationIds, ...result.conflicts.map((conflict) => conflict.operationId)]);
        this.queue.operations = this.queue.operations.filter((operation) => !processed.has(operation.operationId));
        this.queue.conflicts.push(...result.conflicts); this.queue.base = next.value;
        const rebased = applyOperations(next.value.archive, this.queue.operations);
        await this.local.save(rebased); this.last = rebased; this.persistQueue();
      }
      this.status = this.queue.conflicts.length ? "conflicted" : "synced"; this.persistQueue(); this.publishState();
    } catch {
      this.status = "offline"; this.persistQueue(); this.publishState();
      // A failed request is retained and retried without waiting for another edit.
      this.retryTimer ??= setTimeout(() => { this.retryTimer = undefined; void this.synchronize(); }, 5_000);
    }
  }
}

export { LOCAL_ARCHIVE_STORAGE_KEY };
