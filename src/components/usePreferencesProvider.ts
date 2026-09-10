"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPrefsStore } from "@/lib/prefs";
import type { UserPrefs } from "@/lib/types";
import type { PersistenceState } from "@/lib/persistenceQueue";

export type PrefsUpdate = Partial<UserPrefs> | ((current: UserPrefs) => UserPrefs);

export interface PreferencesContextValue {
  prefs: UserPrefs | null;
  updatePrefs(update: PrefsUpdate): void;
  persistence: PersistenceState;
  retryPersistence(): void;
  flushPersistence(): void;
}

const prefsStore = getPrefsStore();

/**
 * Owns preference state: hydration from the store, the theme/layout dataset
 * attributes derived from it, and the debounced write-back. The first render
 * hydrates only — `skipInitialSave` keeps it from echoing the loaded value
 * straight back to disk.
 */
export function usePreferencesProvider(): PreferencesContextValue {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [persistence, setPersistence] = useState<PersistenceState>({ status: "idle" });
  const skipInitialSave = useRef(true);
  const prefsRef = useRef<UserPrefs | null>(null);
  const saveTimeout = useRef<number | null>(null);

  const savePrefs = useCallback((next: UserPrefs, errorMessage: string) => {
    setPersistence({ status: "saving" });
    void prefsStore.save(next)
      .then(() => setPersistence({ status: "saved" }))
      .catch(() => setPersistence({ status: "error", message: errorMessage }));
  }, []);

  useEffect(() => {
    let active = true;
    void prefsStore.load()
      .then((loaded) => {
        if (!active) return;
        prefsRef.current = loaded;
        setPrefs(loaded);
      })
      .catch(() => active && setPersistence({ status: "error", message: "Preferences could not be loaded." }));
    return () => { active = false; };
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
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    setPersistence({ status: "saving" });
    saveTimeout.current = window.setTimeout(() => {
      saveTimeout.current = null;
      savePrefs(prefs, "Preferences were not saved. Your previous choices remain on disk.");
    }, 200);
    return () => {
      if (saveTimeout.current !== null) window.clearTimeout(saveTimeout.current);
    };
  }, [prefs, savePrefs]);

  const updatePrefs = useCallback((update: PrefsUpdate) => {
    setPrefs((current) => {
      if (!current) return current;
      const next = typeof update === "function" ? update(current) : { ...current, ...update };
      prefsRef.current = next;
      return next;
    });
  }, []);

  const flushPersistence = useCallback(() => {
    if (saveTimeout.current !== null) {
      window.clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    if (prefsRef.current) {
      savePrefs(prefsRef.current, "Preferences were not saved. Your previous choices remain on disk.");
    }
  }, [savePrefs]);

  const retryPersistence = useCallback(() => {
    if (!prefs) return;
    savePrefs(prefs, "Preferences still could not be saved.");
  }, [prefs, savePrefs]);

  return useMemo(
    () => ({ prefs, updatePrefs, persistence, retryPersistence, flushPersistence }),
    [prefs, updatePrefs, persistence, retryPersistence, flushPersistence],
  );
}
