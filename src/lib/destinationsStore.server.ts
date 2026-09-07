import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeEncryptionKey, decryptSecret, encryptSecret } from "./destinationSecrets.ts";
import { ArchiveNotFoundError, DestinationNotFoundError } from "./destinationsErrors.ts";
import type {
  Destination,
  DestinationDelivery,
  DestinationKind,
  DestinationStatus,
  NotionConfig,
  ObsidianGitConfig,
} from "./destinations.ts";

function destinationRow(row: Record<string, unknown>): Destination {
  return {
    id: String(row.id),
    archiveId: String(row.archive_id),
    kind: row.kind as DestinationKind,
    status: row.status as DestinationStatus,
    displayName: String(row.display_name),
    config: row.config as ObsidianGitConfig | NotionConfig,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** PostgREST sends/accepts bytea as `\x`-prefixed hex text, not raw bytes. */
function bufferToBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

function byteaToBuffer(value: string): Buffer {
  return Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex");
}

function deliveryRow(row: Record<string, unknown>): DestinationDelivery {
  return {
    destinationId: String(row.destination_id),
    itemId: String(row.item_id),
    externalRef: typeof row.external_ref === "string" ? row.external_ref : null,
    lastDeliveredRevision: Number(row.last_delivered_revision),
    status: row.status as DestinationDelivery["status"],
    lastAttemptedAt: typeof row.last_attempted_at === "string" ? row.last_attempted_at : null,
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    lastHttpStatus: typeof row.last_http_status === "number" ? row.last_http_status : null,
  };
}

/**
 * User-facing CRUD over a single owner's destinations. Never returns
 * secrets: those are only decrypted inside DestinationWorkerStore, which is
 * a narrower interface the delivery worker depends on instead of this one.
 */
export interface DestinationsStore {
  list(ownerId: string): Promise<Destination[]>;
  connect(
    ownerId: string,
    kind: DestinationKind,
    displayName: string,
    config: ObsidianGitConfig | NotionConfig,
    secret: string
  ): Promise<Destination>;
  disconnect(ownerId: string, kind: DestinationKind): Promise<boolean>;
  purge(ownerId: string, kind: DestinationKind): Promise<boolean>;
  deliveries(ownerId: string, kind: DestinationKind): Promise<DestinationDelivery[]>;
}

export interface WorkerDestination {
  ownerId: string;
  archiveId: string;
  kind: DestinationKind;
  config: ObsidianGitConfig | NotionConfig;
  /** The decrypted third-party token/secret. */
  secret: string;
}

export interface DeliveryOutcomeInput {
  itemId: string;
  externalRef: string | null;
  deliveredRevision: number;
  status: DestinationDelivery["status"];
  httpStatus: number | null;
  error: string | null;
}

/**
 * Narrow interface the delivery worker depends on: decrypted secrets and
 * cross-owner enumeration for the cron tick, neither of which the
 * user-facing DestinationsStore exposes.
 */
export interface DestinationWorkerStore {
  /** All active destinations, or just one owner's when called from the post-sync hook. */
  activeDestinations(ownerId?: string): Promise<WorkerDestination[]>;
  /** Current per-item watermarks, so the worker only pushes items dirty since their last delivered revision. */
  deliveries(ownerId: string, kind: DestinationKind): Promise<DestinationDelivery[]>;
  recordOutcome(ownerId: string, kind: DestinationKind, outcome: DeliveryOutcomeInput): Promise<void>;
  markStatus(ownerId: string, kind: DestinationKind, status: DestinationStatus): Promise<void>;
  /**
   * Atomically take the delivery lease for one destination. Returns false when
   * another run holds a live lease or the previous run started less than
   * `minIntervalSeconds` ago (the cross-invocation rate limit).
   */
  acquireDeliveryLease(
    ownerId: string,
    kind: DestinationKind,
    leaseToken: string,
    ttlSeconds: number,
    minIntervalSeconds: number
  ): Promise<boolean>;
  /** Release a lease held under `leaseToken` and record a redaction-safe run summary. A stale token is a no-op. */
  releaseDeliveryLease(
    ownerId: string,
    kind: DestinationKind,
    leaseToken: string,
    outcome: Record<string, unknown>
  ): Promise<void>;
}

export class SupabaseDestinationsStore implements DestinationsStore, DestinationWorkerStore {
  private readonly supabase: SupabaseClient;
  private readonly encryptionKey: Buffer;

  constructor(supabase: SupabaseClient, encryptionKeyBase64: string) {
    this.supabase = supabase;
    this.encryptionKey = decodeEncryptionKey(encryptionKeyBase64);
  }

  async list(ownerId: string): Promise<Destination[]> {
    const archiveId = await this.archiveId(ownerId);
    const { data, error } = await this.supabase
      .from("destinations")
      .select("id,archive_id,kind,status,display_name,config,created_at,updated_at")
      .eq("archive_id", archiveId);
    if (error) throw error;
    return (data ?? []).map((row) => destinationRow(row as Record<string, unknown>));
  }

  async connect(
    ownerId: string,
    kind: DestinationKind,
    displayName: string,
    config: ObsidianGitConfig | NotionConfig,
    secret: string
  ): Promise<Destination> {
    const archiveId = await this.archiveId(ownerId);
    const encrypted = encryptSecret(secret, this.encryptionKey);
    const { data, error } = await this.supabase
      .rpc("create_destination", {
        p_owner_id: ownerId,
        p_archive_id: archiveId,
        p_kind: kind,
        p_display_name: displayName,
        p_config: config,
        p_secret_ciphertext: bufferToBytea(encrypted.ciphertext),
        p_secret_iv: bufferToBytea(encrypted.iv),
        p_secret_auth_tag: bufferToBytea(encrypted.authTag),
      })
      .single();
    if (error) throw error;
    return destinationRow({ ...(data as Record<string, unknown>), archive_id: archiveId });
  }

  async disconnect(ownerId: string, kind: DestinationKind): Promise<boolean> {
    const archiveId = await this.archiveId(ownerId);
    const { data, error } = await this.supabase
      .rpc("disconnect_destination", { p_owner_id: ownerId, p_archive_id: archiveId, p_kind: kind })
      .single();
    if (error) throw error;
    return Boolean(data);
  }

  async purge(ownerId: string, kind: DestinationKind): Promise<boolean> {
    const archiveId = await this.archiveId(ownerId);
    const { data, error } = await this.supabase
      .rpc("purge_destination", { p_owner_id: ownerId, p_archive_id: archiveId, p_kind: kind })
      .single();
    if (error) throw error;
    return Boolean(data);
  }

  async deliveries(ownerId: string, kind: DestinationKind): Promise<DestinationDelivery[]> {
    const destinationId = await this.destinationId(ownerId, kind);
    const { data, error } = await this.supabase
      .from("destination_deliveries")
      .select("destination_id,item_id,external_ref,last_delivered_revision,status,last_attempted_at,last_error,last_http_status")
      .eq("destination_id", destinationId);
    if (error) throw error;
    return (data ?? []).map((row) => deliveryRow(row as Record<string, unknown>));
  }

  async activeDestinations(ownerId?: string): Promise<WorkerDestination[]> {
    let query = this.supabase
      .from("destinations")
      .select("kind,config,secret_ciphertext,secret_iv,secret_auth_tag,archives!inner(id,owner_id)")
      .eq("status", "active")
      .not("secret_ciphertext", "is", null);
    if (ownerId) query = query.eq("archives.owner_id", ownerId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? [])
      .map((row) => row as unknown as {
        kind: DestinationKind;
        config: ObsidianGitConfig | NotionConfig;
        secret_ciphertext: string;
        secret_iv: string;
        secret_auth_tag: string;
        archives: { id: string; owner_id: string };
      })
      .map((row) => ({
        ownerId: row.archives.owner_id,
        archiveId: row.archives.id,
        kind: row.kind,
        config: row.config,
        secret: decryptSecret(
          {
            ciphertext: byteaToBuffer(row.secret_ciphertext),
            iv: byteaToBuffer(row.secret_iv),
            authTag: byteaToBuffer(row.secret_auth_tag),
          },
          this.encryptionKey
        ),
      }));
  }

  async recordOutcome(ownerId: string, kind: DestinationKind, outcome: DeliveryOutcomeInput): Promise<void> {
    const archiveId = await this.archiveId(ownerId);
    const { error } = await this.supabase.rpc("record_delivery_outcome", {
      p_owner_id: ownerId,
      p_archive_id: archiveId,
      p_kind: kind,
      p_item_id: outcome.itemId,
      p_external_ref: outcome.externalRef,
      p_delivered_revision: outcome.deliveredRevision,
      p_status: outcome.status,
      p_http_status: outcome.httpStatus,
      p_error: outcome.error,
    });
    if (error) throw error;
  }

  async markStatus(ownerId: string, kind: DestinationKind, status: DestinationStatus): Promise<void> {
    const archiveId = await this.archiveId(ownerId);
    const { error } = await this.supabase.rpc("mark_destination_status", {
      p_owner_id: ownerId,
      p_archive_id: archiveId,
      p_kind: kind,
      p_status: status,
    });
    if (error) throw error;
  }

  async acquireDeliveryLease(
    ownerId: string,
    kind: DestinationKind,
    leaseToken: string,
    ttlSeconds: number,
    minIntervalSeconds: number
  ): Promise<boolean> {
    const archiveId = await this.archiveId(ownerId);
    const { data, error } = await this.supabase.rpc("acquire_destination_delivery_lease", {
      p_owner_id: ownerId,
      p_archive_id: archiveId,
      p_kind: kind,
      p_lease_token: leaseToken,
      p_ttl_seconds: ttlSeconds,
      p_min_interval_seconds: minIntervalSeconds,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async releaseDeliveryLease(
    ownerId: string,
    kind: DestinationKind,
    leaseToken: string,
    outcome: Record<string, unknown>
  ): Promise<void> {
    const archiveId = await this.archiveId(ownerId);
    const { error } = await this.supabase.rpc("release_destination_delivery_lease", {
      p_owner_id: ownerId,
      p_archive_id: archiveId,
      p_kind: kind,
      p_lease_token: leaseToken,
      p_outcome: outcome,
    });
    if (error) throw error;
  }

  private async archiveId(ownerId: string): Promise<string> {
    const { data, error } = await this.supabase.from("archives").select("id").eq("owner_id", ownerId).maybeSingle();
    if (error) throw error;
    if (!data) throw new ArchiveNotFoundError("Archive not found");
    return (data as { id: string }).id;
  }

  private async destinationId(ownerId: string, kind: DestinationKind): Promise<string> {
    const archiveId = await this.archiveId(ownerId);
    const { data, error } = await this.supabase
      .from("destinations")
      .select("id")
      .eq("archive_id", archiveId)
      .eq("kind", kind)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new DestinationNotFoundError("Destination not found");
    return (data as { id: string }).id;
  }
}
