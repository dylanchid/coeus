"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Topic } from "@/lib/sources";
import type { SettingsTab } from "./SettingsPanel";
import type { SourceFeed } from "@/lib/types";

/**
 * Feed-specific slash-menu commands the Reader registers while it is mounted.
 * Other pages leave this null and the menu simply omits those groups.
 */
export type ReaderSlashContext = {
  topic: Topic;
  sources: SourceFeed[];
  busy: boolean;
  onTopic: (topic: Topic) => void;
  onSearch: (query: string) => void;
  onRefresh: () => void;
  onFocusSearch: () => void;
};

type ChromeValue = {
  slashOpen: boolean;
  openSlash: () => void;
  closeSlash: () => void;
  toggleSlash: () => void;
  settingsOpen: boolean;
  /** Opens Settings; pass a tab to land on it (anything else keeps the last tab). */
  openSettings: (tab?: SettingsTab) => void;
  settingsTab: SettingsTab | null;
  closeSettings: () => void;
  toggleSettings: () => void;
  readerSlash: ReaderSlashContext | null;
  setReaderSlash: Dispatch<SetStateAction<ReaderSlashContext | null>>;
};

const ChromeContext = createContext<ChromeValue | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [readerSlash, setReaderSlash] = useState<ReaderSlashContext | null>(null);

  const openSlash = useCallback(() => {
    setSettingsOpen(false);
    setSlashOpen(true);
  }, []);
  const closeSlash = useCallback(() => setSlashOpen(false), []);
  const toggleSlash = useCallback(() => {
    setSlashOpen((open) => {
      if (open) return false;
      setSettingsOpen(false);
      return true;
    });
  }, []);

  const openSettings = useCallback((tab?: SettingsTab) => {
    setSlashOpen(false);
    setSettingsTab(typeof tab === "string" ? tab : null);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => {
      if (open) return false;
      setSlashOpen(false);
      return true;
    });
  }, []);

  const value = useMemo(
    () => ({
      slashOpen,
      openSlash,
      closeSlash,
      toggleSlash,
      settingsOpen,
      openSettings,
      settingsTab,
      closeSettings,
      toggleSettings,
      readerSlash,
      setReaderSlash,
    }),
    [
      slashOpen,
      openSlash,
      closeSlash,
      toggleSlash,
      settingsOpen,
      openSettings,
      settingsTab,
      closeSettings,
      toggleSettings,
      readerSlash,
      setReaderSlash,
    ]
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeValue {
  const value = useContext(ChromeContext);
  if (!value) throw new Error("useChrome must be used inside ChromeProvider");
  return value;
}
