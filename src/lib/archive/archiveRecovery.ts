import type { ArchiveSyncSnapshot } from "./archiveSync.ts";

export interface ArchiveRevisionSummary {
  revision: number;
  createdAt: string;
}

export interface ContentSnapshotSummary {
  id: string;
  itemId: string;
  canonicalUrl: string;
  fetchedUrl: string | null;
  status: "pending" | "ready" | "failed" | "deleted";
  mediaType: string | null;
  byteLength: number | null;
  sha256: string | null;
  capturedAt: string | null;
  createdAt: string;
}

export interface ArchiveExport {
  format: "coeus.archive.export.v1";
  exportedAt: string;
  archiveId: string;
  current: ArchiveSyncSnapshot;
  revisions: ArchiveRevisionSummary[];
  contentSnapshots: ContentSnapshotSummary[];
}

export function createRecoverySnapshot(source: ArchiveSyncSnapshot, revision: number, generatedAt = new Date().toISOString()): ArchiveSyncSnapshot {
  const snapshot = structuredClone(source);
  snapshot.revision = revision;
  snapshot.generatedAt = generatedAt;
  for (const versions of Object.values(snapshot.entityVersions)) {
    versions.deletedAtRevision = undefined;
    for (const field of Object.keys(versions.fields)) versions.fields[field] = revision;
  }
  return snapshot;
}
