"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { configureArchiveRepository } from "@/lib/archive/archiveRepository";
import { SyncedArchiveRepository, type ArchiveSyncState } from "@/lib/archive/syncedArchiveRepository";
import { PersistenceQueue, type PersistenceState } from "@/lib/persistenceQueue";
import type { ArchiveData } from "@/lib/archiveTypes";
import type { ArchiveSyncSnapshot } from "@/lib/archiveSync";

type ArchiveUpdate = (current: ArchiveData) => ArchiveData;

export interface ArchiveContextValue {
  archive: ArchiveData | null;
  updateArchive(update: ArchiveUpdate): Promise<boolean>;
  sync: ArchiveSyncState;
  persistence: PersistenceState;
  retryPersistence(): Promise<boolean>;
  retrySync(): void;
  replaceArchiveFromServer(archiveId: string, snapshot: ArchiveSyncSnapshot): Promise<void>;
}

const repository = new SyncedArchiveRepository();
configureArchiveRepository(repository);

/**
 * Owns archive state: hydration + cross-tab subscription, the durable
 * `PersistenceQueue` that serializes optimistic updates to storage, sync-state
 * tracking via the `coeus:archive-sync` event, and the server-replace path.
 */
export function useArchiveProvider(): ArchiveContextValue {
  const [archive, setArchive] = useState<ArchiveData | null>(null);
  const [sync, setSync] = useState<ArchiveSyncState>(() => repository.getSyncState());
  const [persistence, setPersistence] = useState<PersistenceState>({ status: "idle" });
  const archiveRef = useRef<ArchiveData | null>(null);
  const [queue] = useState(() => new PersistenceQueue(
    (next: ArchiveData) => repository.save(next),
    setPersistence,
    "Archive changes were not saved. Retry before leaving this page.",
  ));

  useEffect(() => {
    let active = true;
    void repository.load()
      .then((loaded) => {
        if (!active) return;
        archiveRef.current = loaded;
        setArchive(loaded);
      })
      .catch(() => active && setPersistence({ status: "error", message: "Your archive could not be opened." }));
    const unsubscribe = repository.subscribe((loaded) => {
      if (!active) return;
      archiveRef.current = loaded;
      setArchive(loaded);
    });
    const syncUpdate = () => active && setSync(repository.getSyncState());
    window.addEventListener("coeus:archive-sync", syncUpdate);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("coeus:archive-sync", syncUpdate);
    };
  }, []);

  const updateArchive = useCallback((update: ArchiveUpdate): Promise<boolean> => {
    const current = archiveRef.current;
    if (!current) return Promise.resolve(false);
    const next = update(current);
    if (next === current) return Promise.resolve(true);
    archiveRef.current = next;
    setArchive(next);
    return queue.enqueue(next);
  }, [queue]);

  const retryPersistence = useCallback((): Promise<boolean> => queue.retry(), [queue]);

  const replaceArchiveFromServer = useCallback(async (archiveId: string, snapshot: ArchiveSyncSnapshot) => {
    await repository.replaceFromServer(archiveId, snapshot);
    archiveRef.current = snapshot.archive;
    setArchive(snapshot.archive);
    setPersistence({ status: "saved" });
    setSync(repository.getSyncState());
  }, []);

  const retrySync = useCallback(() => {
    repository.retrySync();
    setSync(repository.getSyncState());
  }, []);

  return useMemo(
    () => ({ archive, updateArchive, sync, persistence, retryPersistence, retrySync, replaceArchiveFromServer }),
    [archive, updateArchive, sync, persistence, retryPersistence, retrySync, replaceArchiveFromServer],
  );
}
