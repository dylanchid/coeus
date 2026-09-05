"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getPrefsStore } from "@/lib/prefs";
import { ChromeProvider } from "./ChromeProvider";
import { SyncedArchiveRepository } from "@/lib/syncedArchiveRepository";
import { configureArchiveRepository } from "@/lib/archiveRepository";
import type { ArchiveData } from "@/lib/archiveTypes";
import type { ArchiveSyncState } from "@/lib/syncedArchiveRepository";
import type { ArchiveSyncSnapshot } from "@/lib/archiveSync";
import type { UserPrefs } from "@/lib/types";
import { PersistenceQueue, type PersistenceState } from "@/lib/persistenceQueue";

type PrefsUpdate = Partial<UserPrefs> | ((current: UserPrefs) => UserPrefs);
type ArchiveUpdate = (current: ArchiveData) => ArchiveData;

interface PreferencesContextValue {
  prefs: UserPrefs | null;
  updatePrefs(update: PrefsUpdate): void;
  persistence: PersistenceState;
  retryPersistence(): void;
}

interface ArchiveContextValue {
  archive: ArchiveData | null;
  updateArchive(update: ArchiveUpdate): Promise<boolean>;
  sync: ArchiveSyncState;
  persistence: PersistenceState;
  retryPersistence(): Promise<boolean>;
  replaceArchiveFromServer(archiveId: string, snapshot: ArchiveSyncSnapshot): Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const ArchiveContext = createContext<ArchiveContextValue | null>(null);
const prefsStore = getPrefsStore();
const repository = new SyncedArchiveRepository();
configureArchiveRepository(repository);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [archive, setArchive] = useState<ArchiveData | null>(null);
  const [sync, setSync] = useState<ArchiveSyncState>(() => repository.getSyncState());
  const [prefsPersistence, setPrefsPersistence] = useState<PersistenceState>({ status: "idle" });
  const [archivePersistence, setArchivePersistence] = useState<PersistenceState>({ status: "idle" });
  const archiveRef = useRef<ArchiveData | null>(null);
  const skipInitialPrefsSave = useRef(true);
  const [archivePersistenceQueue] = useState(() => new PersistenceQueue(
      (next: ArchiveData) => repository.save(next),
      setArchivePersistence,
      "Archive changes were not saved. Retry before leaving this page."
    ));

  useEffect(() => {
    let active = true;
    void prefsStore.load()
      .then((loaded) => active && setPrefs(loaded))
      .catch(() => active && setPrefsPersistence({ status: "error", message: "Preferences could not be loaded." }));
    void repository.load()
      .then((loaded) => {
        if (!active) return;
        archiveRef.current = loaded;
        setArchive(loaded);
      })
      .catch(() => active && setArchivePersistence({ status: "error", message: "Your archive could not be opened." }));
    const unsubscribe = repository.subscribe((loaded) => {
      if (!active) return;
      archiveRef.current = loaded;
      setArchive(loaded);
    });
    const syncUpdate = () => active && setSync(repository.getSyncState());
    window.addEventListener("bareaga:archive-sync", syncUpdate);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("bareaga:archive-sync", syncUpdate);
    };
  }, []);

  useEffect(() => {
    if (!prefs) return;
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.palette = prefs.palette;
    root.dataset.font = prefs.font;
    root.dataset.density = prefs.density;
    root.dataset.homeView = prefs.homeView;
    root.dataset.storyRepresentation = prefs.storyRepresentation;
    root.style.setProperty("--cols", String(prefs.columns));
    if (skipInitialPrefsSave.current) {
      skipInitialPrefsSave.current = false;
      return;
    }
    setPrefsPersistence({ status: "saving" });
    const timeout = window.setTimeout(() => {
      void prefsStore.save(prefs)
        .then(() => setPrefsPersistence({ status: "saved" }))
        .catch(() => setPrefsPersistence({ status: "error", message: "Preferences were not saved. Your previous choices remain on disk." }));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [prefs]);

  const updatePrefs = useCallback((update: PrefsUpdate) => {
    setPrefs((current) => {
      if (!current) return current;
      return typeof update === "function" ? update(current) : { ...current, ...update };
    });
  }, []);

  const retryPrefsPersistence = useCallback(() => {
    if (!prefs) return;
    setPrefsPersistence({ status: "saving" });
    void prefsStore.save(prefs)
      .then(() => setPrefsPersistence({ status: "saved" }))
      .catch(() => setPrefsPersistence({ status: "error", message: "Preferences still could not be saved." }));
  }, [prefs]);

  const updateArchive = useCallback((update: ArchiveUpdate): Promise<boolean> => {
    const current = archiveRef.current;
    if (!current) return Promise.resolve(false);
    const next = update(current);
    if (next === current) return Promise.resolve(true);
    archiveRef.current = next;
    setArchive(next);
    return archivePersistenceQueue.enqueue(next);
  }, [archivePersistenceQueue]);

  const retryArchivePersistence = useCallback((): Promise<boolean> => {
    return archivePersistenceQueue.retry();
  }, [archivePersistenceQueue]);

  const replaceArchiveFromServer = useCallback(async (archiveId: string, snapshot: ArchiveSyncSnapshot) => {
    await repository.replaceFromServer(archiveId, snapshot);
    archiveRef.current = snapshot.archive;
    setArchive(snapshot.archive);
    setArchivePersistence({ status: "saved" });
    setSync(repository.getSyncState());
  }, []);

  const prefsValue = useMemo(() => ({ prefs, updatePrefs, persistence: prefsPersistence, retryPersistence: retryPrefsPersistence }), [prefs, updatePrefs, prefsPersistence, retryPrefsPersistence]);
  const archiveValue = useMemo(() => ({ archive, updateArchive, sync, persistence: archivePersistence, retryPersistence: retryArchivePersistence, replaceArchiveFromServer }), [archive, updateArchive, sync, archivePersistence, retryArchivePersistence, replaceArchiveFromServer]);
  return (
    <PreferencesContext.Provider value={prefsValue}>
      <ArchiveContext.Provider value={archiveValue}>
        <ChromeProvider>{children}</ChromeProvider>
      </ArchiveContext.Provider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside AppProviders");
  return value;
}

export function useArchive(): ArchiveContextValue {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error("useArchive must be used inside AppProviders");
  return value;
}
