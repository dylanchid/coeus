import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRecoverySnapshot, type ArchiveRevisionSummary, type ContentSnapshotSummary } from "./archiveRecovery.ts";
import { parseArchiveSyncSnapshot, type ArchiveSyncSnapshot } from "./archiveSync.ts";
import { fetchSafeContent } from "./safeContentFetch.server.ts";

export interface ArchiveRecoveryStore {
  export(ownerId: string): Promise<{ archiveId: string; current: ArchiveSyncSnapshot; revisions: ArchiveRevisionSummary[]; contentSnapshots: ContentSnapshotSummary[] }>;
  restore(ownerId: string, revision: number): Promise<{ archiveId: string; snapshot: ArchiveSyncSnapshot }>;
  capture(ownerId: string, itemId: string): Promise<ContentSnapshotSummary>;
  content(ownerId: string, snapshotId: string): Promise<{ body: Blob; mediaType: string; filename: string }>;
  deleteAccount(ownerId: string): Promise<void>;
}

function snapshot(value: unknown): ArchiveSyncSnapshot {
  const parsed = parseArchiveSyncSnapshot(value);
  if (!parsed.ok) throw new Error(`Stored archive is corrupt: ${parsed.error}`);
  return parsed.value;
}

function summary(row: Record<string, unknown>): ContentSnapshotSummary {
  return {
    id: String(row.id), itemId: String(row.item_id), canonicalUrl: String(row.canonical_url),
    fetchedUrl: typeof row.fetched_url === "string" ? row.fetched_url : null,
    status: row.status as ContentSnapshotSummary["status"],
    mediaType: typeof row.media_type === "string" ? row.media_type : null,
    byteLength: typeof row.byte_length === "number" ? row.byte_length : null,
    sha256: typeof row.sha256 === "string" ? row.sha256 : null,
    capturedAt: typeof row.captured_at === "string" ? row.captured_at : null,
    createdAt: String(row.created_at),
  };
}

export class SupabaseArchiveRecoveryStore implements ArchiveRecoveryStore {
  // Not a TS parameter-property shorthand: that construct breaks any test file
  // that imports this module under node --experimental-strip-types. See
  // archiveSyncStore.server.ts, which follows the same explicit-field pattern.
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async export(ownerId: string) {
    const archive = await this.archive(ownerId);
    const [{ data: revisions, error: revisionsError }, { data: contentSnapshots, error: contentError }] = await Promise.all([
      this.supabase.from("archive_revisions").select("revision,created_at").eq("archive_id", archive.id).order("revision", { ascending: false }),
      this.supabase.from("content_snapshots").select("id,item_id,canonical_url,fetched_url,status,media_type,byte_length,sha256,captured_at,created_at").eq("archive_id", archive.id).order("created_at", { ascending: false }),
    ]);
    if (revisionsError) throw revisionsError;
    if (contentError) throw contentError;
    return {
      archiveId: archive.id,
      current: archive.current,
      revisions: (revisions ?? []).map((row) => ({ revision: Number(row.revision), createdAt: String(row.created_at) })),
      contentSnapshots: (contentSnapshots ?? []).map((row) => summary(row as Record<string, unknown>)),
    };
  }

  async restore(ownerId: string, revision: number) {
    const archive = await this.archive(ownerId);
    const { data: target, error } = await this.supabase.from("archive_revisions").select("snapshot").eq("archive_id", archive.id).eq("revision", revision).maybeSingle();
    if (error) throw error;
    if (!target) throw new Error("Revision not found");
    const restored = createRecoverySnapshot(snapshot((target as { snapshot: unknown }).snapshot), archive.current.revision + 1);
    const { data, error: restoreError } = await this.supabase.rpc("restore_archive_revision", {
      p_owner_id: ownerId, p_archive_id: archive.id, p_expected_revision: archive.current.revision, p_snapshot: restored,
    }).single();
    if (restoreError) throw restoreError;
    const result = data as { restored: boolean; snapshot: unknown };
    if (!result.restored) throw new Error("Archive changed; refresh and try again");
    return { archiveId: archive.id, snapshot: snapshot(result.snapshot) };
  }

  async capture(ownerId: string, itemId: string): Promise<ContentSnapshotSummary> {
    const archive = await this.archive(ownerId);
    const item = archive.current.archive.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Archive item not found");
    const captured = await fetchSafeContent(item.url);
    const sha256 = createHash("sha256").update(captured.body).digest("hex");
    const objectPath = `snapshots/${archive.id}/${itemId}/${sha256}.html`;
    const { error: uploadError } = await this.supabase.storage.from("archive-snapshots").upload(objectPath, captured.body, { contentType: captured.mediaType, upsert: false });
    if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.from("content_snapshots").upsert({
      archive_id: archive.id, item_id: itemId, canonical_url: item.url, fetched_url: captured.fetchedUrl,
      object_path: objectPath, status: "ready", media_type: captured.mediaType, byte_length: captured.body.byteLength,
      sha256, captured_at: now, updated_at: now,
    }, { onConflict: "archive_id,item_id,sha256" }).select("id,item_id,canonical_url,fetched_url,status,media_type,byte_length,sha256,captured_at,created_at").single();
    if (error) throw error;
    return summary(data as Record<string, unknown>);
  }

  async content(ownerId: string, snapshotId: string) {
    const archive = await this.archive(ownerId);
    const { data, error } = await this.supabase.from("content_snapshots").select("object_path,media_type").eq("archive_id", archive.id).eq("id", snapshotId).eq("status", "ready").maybeSingle();
    if (error) throw error;
    if (!data?.object_path) throw new Error("Captured content not found");
    const { data: body, error: downloadError } = await this.supabase.storage.from("archive-snapshots").download(data.object_path);
    if (downloadError || !body) throw downloadError ?? new Error("Captured content not found");
    return { body, mediaType: data.media_type ?? "application/octet-stream", filename: `${snapshotId}.html` };
  }

  async deleteAccount(ownerId: string): Promise<void> {
    let archive: { id: string; current: ArchiveSyncSnapshot } | null = null;
    try { archive = await this.archive(ownerId); } catch { archive = null; }
    if (archive) {
      const { data: paths, error: pathsError } = await this.supabase.from("content_snapshots").select("object_path").eq("archive_id", archive.id).not("object_path", "is", null);
      if (pathsError) throw pathsError;
      const objectPaths = (paths ?? []).map((row) => row.object_path).filter((path): path is string => Boolean(path));
      if (objectPaths.length) {
        const { error } = await this.supabase.storage.from("archive-snapshots").remove(objectPaths);
        if (error) throw error;
      }
    }
    const { error } = await this.supabase.auth.admin.deleteUser(ownerId);
    if (error) throw error;
  }

  private async archive(ownerId: string): Promise<{ id: string; current: ArchiveSyncSnapshot }> {
    const { data: archive, error: archiveError } = await this.supabase.from("archives").select("id,current_revision").eq("owner_id", ownerId).maybeSingle();
    if (archiveError) throw archiveError;
    if (!archive) throw new Error("Archive not found");
    const { data: revision, error: revisionError } = await this.supabase.from("archive_revisions").select("snapshot").eq("archive_id", archive.id).eq("revision", archive.current_revision).single();
    if (revisionError) throw revisionError;
    return { id: archive.id, current: snapshot((revision as { snapshot: unknown }).snapshot) };
  }
}
