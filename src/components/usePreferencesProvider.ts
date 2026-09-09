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

  useEffect(() => {
    let active = true;
    void prefsStore.load()
      .then((loaded) => active && setPrefs(loaded))
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
    const timeout = window.setTimeout(() => {
      void prefsStore.save(prefs)
        .then(() => setPersistence({ status: "saved" }))
        .catch(() => setPersistence({ status: "error", message: "Preferences were not saved. Your previous choices remain on disk." }));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [prefs]);

  const updatePrefs = useCallback((update: PrefsUpdate) => {
    setPrefs((current) => {
      if (!current) return current;
      return typeof update === "function" ? update(current) : { ...current, ...update };
    });
  }, []);

  const retryPersistence = useCallback(() => {
    if (!prefs) return;
    setPersistence({ status: "saving" });
    void prefsStore.save(prefs)
      .then(() => setPersistence({ status: "saved" }))
      .catch(() => setPersistence({ status: "error", message: "Preferences still could not be saved." }));
  }, [prefs]);

  return useMemo(
    () => ({ prefs, updatePrefs, persistence, retryPersistence }),
    [prefs, updatePrefs, persistence, retryPersistence],
  );
}
