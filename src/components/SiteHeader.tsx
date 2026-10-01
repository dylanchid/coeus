"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserPrefs } from "@/lib/types";
import { useArchive, usePreferences } from "./AppProviders";
import { useChrome } from "./ChromeProvider";
import { PrimaryNav, type AppSection } from "./PrimaryNav";
import { SettingsPanel } from "./SettingsPanel";
import { HeaderSearch, FOCUS_HEADER_SEARCH_EVENT } from "./HeaderSearch";
import { MessagesButton } from "./MessagesButton";
import { SettingsMenu } from "./SettingsMenu";
import { NotificationsButton } from "./NotificationsButton";
import { AccountMenu } from "./AccountMenu";

function focusHeaderSearch(command: boolean) {
  window.dispatchEvent(new CustomEvent(FOCUS_HEADER_SEARCH_EVENT, { detail: { command } }));
}

function downloadPrefs(prefs: UserPrefs) {
  const blob = new Blob([JSON.stringify(prefs, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "coeus-prefs.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SiteHeader({
  section,
  subline,
}: {
  section: AppSection;
  /** Optional muted line under the header bar (Reader's "Updated…" status). */
  subline?: ReactNode;
}) {
  const { prefs, updatePrefs, persistence: prefsPersistence, retryPersistence: retryPrefs } = usePreferences();
  const { archive, persistence: archivePersistence, retryPersistence: retryArchive } = useArchive();
  const chrome = useChrome();
  const router = useRouter();

  const { toggleSettings } = chrome;


  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!prefs) return;
      const el = event.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);

      // ⌘K / Ctrl+K jumps to the search box in command mode, even while typing.
      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        focusHeaderSearch(true);
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        focusHeaderSearch(true);
      } else if (event.key === ",") {
        event.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs, toggleSettings]);

  const archiveCount = archive?.items.length ?? undefined;
  const persistenceError = prefsPersistence.status === "error"
    ? prefsPersistence.message
    : archivePersistence.status === "error"
      ? archivePersistence.message
      : null;
  const saving = prefsPersistence.status === "saving" || archivePersistence.status === "saving";

  const retryPersistence = () => {
    if (prefsPersistence.status === "error") retryPrefs();
    if (archivePersistence.status === "error") void retryArchive();
  };

  const commandContext = prefs
    ? {
        prefs,
        currentSection: section,
        onPrefs: updatePrefs,
        onOpenSettings: chrome.openSettings,
        onExportPrefs: () => downloadPrefs(prefs),
        onNavigate: (href: string) => router.push(href),
        reader: chrome.readerSlash ?? undefined,
      }
    : null;

  return (
    <header className="site-header">
      <div className="site-header-bar">
        <Link className="site-identity" href="/" aria-label="Coeus — home">
          <span className="site-wordmark">Coeus</span>
        </Link>

        <PrimaryNav
          section={section}
          archiveCount={archiveCount}
          search={<HeaderSearch commandContext={commandContext} />}
        />

        <div className="site-tools">
          <Link className="try-plus" href="/plus">Try+</Link>
          <AccountMenu />
          <NotificationsButton />
          <MessagesButton />
          {prefs && commandContext ? (
            <>
              <SettingsMenu onOpenSettings={chrome.openSettings} onExportPrefs={() => downloadPrefs(prefs)} />
              <SettingsPanel
                open={chrome.settingsOpen}
                prefs={prefs}
                onClose={chrome.closeSettings}
                onChange={updatePrefs}
                initialTab={section === "reader" ? "reading" : "appearance"}
              />
            </>
          ) : null}
        </div>
      </div>

      {subline ? <p className="site-subline">{subline}</p> : null}
      {persistenceError ? (
        <p className="persistence-status is-error" role="alert">
          {persistenceError} <button type="button" onClick={retryPersistence}>Retry</button>
        </p>
      ) : saving ? (
        <p className="persistence-status" role="status">Saving changes…</p>
      ) : null}
    </header>
  );
}
