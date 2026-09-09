"use client";

import { useState } from "react";
import type { ArchiveRevisionSummary, ContentSnapshotSummary } from "@/lib/archiveRecovery";
import { parseArchiveSyncSnapshot, type ArchiveSyncSnapshot } from "@/lib/archiveSync";

type RequestJson = (url: string, init?: RequestInit) => Promise<Response>;

/** Server-backed history and snapshot actions, isolated from local archive browsing. */
export function useArchiveRecovery({ requestJson, replaceArchiveFromServer, onNotice }: {
  requestJson: RequestJson;
  replaceArchiveFromServer: (archiveId: string, snapshot: ArchiveSyncSnapshot) => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [revisions, setRevisions] = useState<ArchiveRevisionSummary[]>([]);
  const [contentSnapshots, setContentSnapshots] = useState<ContentSnapshotSummary[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const refreshRecovery = async () => {
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/revisions");
      const body = await response.json() as { revisions: ArchiveRevisionSummary[] };
      setRevisions(body.revisions);
      const exportResponse = await requestJson("/api/archive/export");
      const exported = await exportResponse.json() as { contentSnapshots: ContentSnapshotSummary[] };
      setContentSnapshots(exported.contentSnapshots);
      onNotice("Recovery history refreshed");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Recovery history is unavailable"); }
    finally { setRecoveryBusy(false); }
  };

  const captureContent = async (itemId: string) => {
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
      const captured = await response.json() as ContentSnapshotSummary;
      setContentSnapshots((current) => [captured, ...current.filter((snapshot) => snapshot.id !== captured.id)]);
      onNotice("Private reading snapshot captured");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Content capture failed"); }
    finally { setRecoveryBusy(false); }
  };

  const restoreRevision = async (revision: number) => {
    if (!window.confirm(`Restore revision ${revision}? This creates a new recovery revision; existing history remains.`)) return;
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/revisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) });
      const body = await response.json() as { archiveId: string; snapshot: unknown };
      const parsed = parseArchiveSyncSnapshot(body.snapshot);
      if (!parsed.ok) throw new Error("The recovered archive is invalid");
      await replaceArchiveFromServer(body.archiveId, parsed.value);
      onNotice(`Restored revision ${revision}; a new immutable revision was created`);
      await refreshRecovery();
    } catch (error) { onNotice(error instanceof Error ? error.message : "Archive recovery failed"); }
    finally { setRecoveryBusy(false); }
  };

  return { revisions, contentSnapshots, recoveryBusy, refreshRecovery, captureContent, restoreRevision };
}
