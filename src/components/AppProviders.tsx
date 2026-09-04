"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getPrefsStore } from "@/lib/prefs";
import { ChromeProvider } from "./ChromeProvider";
import { LocalStorageArchiveRepository } from "@/lib/localArchiveRepository";
import { configureArchiveRepository } from "@/lib/archiveRepository";
import type { ArchiveData } from "@/lib/archiveTypes";
import type { UserPrefs } from "@/lib/types";

type PrefsUpdate = Partial<UserPrefs> | ((current: UserPrefs) => UserPrefs);
type ArchiveUpdate = (current: ArchiveData) => ArchiveData;

interface PreferencesContextValue {
  prefs: UserPrefs | null;
  updatePrefs(update: PrefsUpdate): void;
}

interface ArchiveContextValue {
  archive: ArchiveData | null;
  updateArchive(update: ArchiveUpdate): void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);
const ArchiveContext = createContext<ArchiveContextValue | null>(null);
const prefsStore = getPrefsStore();
const repository = new LocalStorageArchiveRepository();
configureArchiveRepository(repository);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [archive, setArchive] = useState<ArchiveData | null>(null);

  useEffect(() => {
    let active = true;
    void prefsStore.load().then((loaded) => active && setPrefs(loaded));
    void repository.load().then((loaded) => active && setArchive(loaded));
    const unsubscribe = repository.subscribe((loaded) => active && setArchive(loaded));
    return () => {
      active = false;
      unsubscribe();
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
    const timeout = window.setTimeout(() => void prefsStore.save(prefs), 200);
    return () => window.clearTimeout(timeout);
  }, [prefs]);

  useEffect(() => {
    if (!archive) return;
    const timeout = window.setTimeout(() => void repository.save(archive), 100);
    return () => window.clearTimeout(timeout);
  }, [archive]);

  const updatePrefs = useCallback((update: PrefsUpdate) => {
    setPrefs((current) => {
      if (!current) return current;
      return typeof update === "function" ? update(current) : { ...current, ...update };
    });
  }, []);

  const updateArchive = useCallback((update: ArchiveUpdate) => {
    setArchive((current) => current ? update(current) : current);
  }, []);

  const prefsValue = useMemo(() => ({ prefs, updatePrefs }), [prefs, updatePrefs]);
  const archiveValue = useMemo(() => ({ archive, updateArchive }), [archive, updateArchive]);
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
