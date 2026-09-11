import { parseArchiveSyncSnapshot, type ArchiveEntityKind, type ArchiveSyncConflict, type ArchiveSyncOperation, type ArchiveSyncSnapshot } from "./archiveSync.ts";
import type { ArchiveData, ArchiveRepository } from "./archiveTypes.ts";
import { LOCAL_ARCHIVE_STORAGE_KEY, LocalStorageArchiveRepository } from "./localArchiveRepository.ts";
import { backoffMs, classifyStatus, isPermanent, type BackoffConfig, type SyncFailureClass } from "./syncFailure.ts";

const QUEUE_KEY = "coeus.archive.sync-queue.v1";
const STATE_KEY = "coeus.archive.sync-state.v1";
const CORRUPT_QUEUE_KEY = `${QUEUE_KEY}.corrupt`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
interface QueueState { clientId: string; archiveId?: string; base?: ArchiveSyncSnapshot; operations: ArchiveSyncOperation[]; conflicts: ArchiveSyncConflict[]; }

export type ArchiveSyncStatus = "local" | "syncing" | "synced" | "offline" | "conflicted" | "error" | "auth_required";
export interface ArchiveSyncState {
  status: ArchiveSyncStatus;
  pending: number;
  conflicts: number;
  /** Human-readable detail for a non-terminal (`offline`) or paused (`error`/`auth_required`) state. */
  message?: string;
  /** True while auto-sync is stopped on a permanent failure; `retrySync()` is required to resume. */
  paused: boolean;
  /** True once for the session if a corrupt sync queue was found and copied aside instead of dropped. */
  recoveredCorruptQueue: boolean;
}

export interface SyncedArchiveRepositoryOptions {
  scheduler?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  backoff?: Partial<BackoffConfig>;
}

/** A classified synchronization failure. Raw network errors are wrapped as `retryable`. */
class SyncError extends Error {
  readonly kind: SyncFailureClass;
  readonly retryAfter: string | null;
  constructor(kind: SyncFailureClass, message: string, retryAfter: string | null = null) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

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
  private readonly scheduler: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly backoffConfig?: Partial<BackoffConfig>;
  private queue: QueueState;
  private last?: ArchiveData;
  private status: ArchiveSyncStatus = "local";
  private message?: string;
  private running?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  /** Set on a permanent failure; auto-sync is suppressed until `retrySync()`. */
  private paused?: { status: "error" | "auth_required"; message: string };
  private recoveredCorruptQueue = false;

  constructor(
    local = new LocalStorageArchiveRepository(),
    persistentStorage = storage(),
    options: SyncedArchiveRepositoryOptions = {}
  ) {
    this.local = local;
    this.store = persistentStorage;
    this.scheduler = options.scheduler ?? ((fn, ms) => setTimeout(fn, ms));
    this.backoffConfig = options.backoff;
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
  getSyncState(): ArchiveSyncState {
    return {
      status: this.status,
      pending: this.queue.operations.length,
      conflicts: this.queue.conflicts.length,
      message: this.paused?.message ?? this.message,
      paused: Boolean(this.paused),
      recoveredCorruptQueue: this.recoveredCorruptQueue,
    };
  }

  /**
   * Serialize the durable queue for user-driven recovery/export. Includes a
   * corrupt earlier queue when one was preserved. Never contains credentials.
   */
  exportQueue(): { queue: QueueState; corrupt: string | null } {
    return { queue: structuredClone(this.queue), corrupt: this.store?.getItem(CORRUPT_QUEUE_KEY) ?? null };
  }

  /** Clear a permanent-failure pause (e.g. after re-authenticating) and try again. */
  retrySync(): void {
    this.paused = undefined;
    this.retryAttempt = 0;
    this.clearRetryTimer();
    void this.synchronize();
  }

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
    const raw = this.store?.getItem(QUEUE_KEY) ?? null;
    if (raw && raw !== "null") {
      try {
        const saved = JSON.parse(raw) as Partial<QueueState>;
        if (saved?.clientId && Array.isArray(saved.operations) && Array.isArray(saved.conflicts)) return saved as QueueState;
      } catch { /* fall through to preservation */ }
      // Non-null but unusable: keep the bytes for recovery/export rather than
      // silently dropping pending operations. Don't clobber an earlier copy.
      try {
        if (this.store && !this.store.getItem(CORRUPT_QUEUE_KEY)) this.store.setItem(CORRUPT_QUEUE_KEY, raw);
      } catch { /* storage full or unavailable; nothing more we can do */ }
      this.recoveredCorruptQueue = true;
    }
    return { clientId: id("client"), operations: [], conflicts: [] };
  }

  private persistQueue(): void { this.store?.setItem(QUEUE_KEY, JSON.stringify(this.queue)); }

  private publishState(): void {
    const state = this.getSyncState();
    this.store?.setItem(STATE_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("coeus:archive-sync", { detail: state }));
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = undefined; }
  }

  private async synchronize(): Promise<void> {
    if (this.paused) return; // permanent failure: wait for retrySync()
    if (this.running || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      if (!this.running) { this.status = "offline"; this.message = "You are offline."; this.publishState(); }
      return;
    }
    this.running = this.syncLoop().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async syncLoop(): Promise<void> {
    this.status = "syncing"; this.message = undefined; this.publishState();
    try {
      const response = await this.request("/api/archive", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        // Not signed in is a normal resting state for a local-first archive, not a failure.
        this.status = "local"; this.message = undefined; this.retryAttempt = 0; this.publishState();
        return;
      }
      if (response.status === 403) {
        throw new SyncError("auth", "This account is not permitted to sync.", response.headers.get("retry-after"));
      }
      if (!response.ok) {
        throw new SyncError(classifyStatus(response.status), `Archive read failed (${response.status})`, response.headers.get("retry-after"));
      }
      const remote = await this.readJson(response) as { archiveId: string; snapshot: unknown };
      const parsed = parseArchiveSyncSnapshot(remote.snapshot);
      if (!parsed.ok) throw new SyncError("malformed", `Server sent an unreadable archive snapshot: ${parsed.error}`);
      this.queue.archiveId = remote.archiveId; this.queue.base = parsed.value;
      const currentLocal = this.last ?? await this.local.load();
      // First account connection uploads a local archive as operations; it never overwrites a remote snapshot.
      if (!this.queue.operations.length && !empty(currentLocal)) this.queue.operations.push(...operationsForChange(parsed.value.archive, currentLocal));
      while (this.queue.operations.length) {
        const base = this.queue.base;
        const body = { syncVersion: 1, archiveId: this.queue.archiveId, clientId: this.queue.clientId, baseRevision: base.revision, operations: this.queue.operations.slice(0, 500) };
        const synced = await this.request("/api/archive/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!synced.ok) {
          throw new SyncError(classifyStatus(synced.status), `Archive sync failed (${synced.status})`, synced.headers.get("retry-after"));
        }
        const result = await this.readJson(synced) as { snapshot: unknown; acceptedOperationIds: string[]; conflicts: ArchiveSyncConflict[] };
        const next = parseArchiveSyncSnapshot(result.snapshot);
        if (!next.ok) throw new SyncError("malformed", `Server sent an unreadable sync result: ${next.error}`);
        if (!Array.isArray(result.acceptedOperationIds) || !Array.isArray(result.conflicts)) {
          throw new SyncError("malformed", "Server sync result is missing accepted/conflict lists.");
        }
        const processed = new Set([...result.acceptedOperationIds, ...result.conflicts.map((conflict) => conflict.operationId)]);
        if (processed.size === 0) {
          // The server accepted the request but advanced nothing; retrying the
          // identical batch would loop. Treat as a broken contract.
          throw new SyncError("malformed", "Server accepted the sync but processed no operations.");
        }
        this.queue.operations = this.queue.operations.filter((operation) => !processed.has(operation.operationId));
        this.queue.conflicts.push(...result.conflicts); this.queue.base = next.value;
        const rebased = applyOperations(next.value.archive, this.queue.operations);
        await this.local.save(rebased); this.last = rebased; this.persistQueue();
      }
      this.retryAttempt = 0;
      this.clearRetryTimer();
      this.status = this.queue.conflicts.length ? "conflicted" : "synced";
      this.message = undefined;
      this.persistQueue(); this.publishState();
    } catch (error) {
      this.handleFailure(error);
    }
  }

  private handleFailure(error: unknown): void {
    const failure: SyncError = error instanceof SyncError
      ? error
      : new SyncError("retryable", error instanceof Error ? error.message : "Network request failed");
    this.persistQueue();

    if (isPermanent(failure.kind)) {
      const status = failure.kind === "auth" ? "auth_required" : "error";
      this.paused = { status, message: failure.message };
      this.status = status;
      this.message = failure.message;
      this.clearRetryTimer();
      this.publishState();
      return;
    }

    // Retryable: bounded exponential backoff with jitter, honoring Retry-After.
    this.status = "offline";
    this.message = failure.message;
    this.publishState();
    const delay = backoffMs(this.retryAttempt, failure.retryAfter, {
      baseMs: this.backoffConfig?.baseMs ?? 1_000,
      maxMs: this.backoffConfig?.maxMs ?? 5 * 60_000,
      random: this.backoffConfig?.random,
    });
    this.retryAttempt += 1;
    if (!this.retryTimer) {
      this.retryTimer = this.scheduler(() => { this.retryTimer = undefined; void this.synchronize(); }, delay);
    }
  }

  private request(input: string, init: RequestInit): Promise<Response> {
    return fetch(input, init);
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new SyncError("malformed", "Server response was not valid JSON.");
    }
  }
}

export { LOCAL_ARCHIVE_STORAGE_KEY };
