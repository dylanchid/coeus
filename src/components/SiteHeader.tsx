"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserPrefs } from "@/lib/types";
import { useArchive, usePreferences } from "./AppProviders";
import { useChrome } from "./ChromeProvider";
import { PrimaryNav, SECTION_LABELS, type AppSection } from "./PrimaryNav";
import { SettingsPanel } from "./SettingsPanel";
import { SlashMenu } from "./SlashMenu";

function downloadPrefs(prefs: UserPrefs) {
  const blob = new Blob([JSON.stringify(prefs, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "bareaga-prefs.json";
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

  const { slashOpen, toggleSlash, openSlash, toggleSettings } = chrome;

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

      // ⌘K / Ctrl+K toggles the palette even while typing.
      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        toggleSlash();
        return;
      }

      if (slashOpen) return; // SlashMenu owns keys while open
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        openSlash();
      } else if (event.key === ",") {
        event.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs, slashOpen, toggleSlash, openSlash, toggleSettings]);

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

  return (
    <header className="site-header">
      <div className="site-header-bar">
        <div className="site-identity">
          <Link className="site-wordmark" href="/">
            Bareaga
          </Link>
          {section !== "reader" ? (
            <span className="site-section">/ {SECTION_LABELS[section]}</span>
          ) : null}
        </div>

        <div className="site-tools">
          <PrimaryNav section={section} archiveCount={archiveCount} />
          {prefs ? (
            <>
              <button
                type="button"
                className="chrome-btn chrome-btn--slash"
                data-slash-toggle
                aria-expanded={chrome.slashOpen}
                aria-haspopup="dialog"
                title="Slash menu (/ or ⌘K)"
                onClick={toggleSlash}
              >
                <span aria-hidden="true">/</span>
                <span className="chrome-btn-mobile-label">Commands</span>
              </button>
              <button
                type="button"
                className="chrome-btn"
                data-settings-toggle
                aria-controls="settings-popover"
                aria-expanded={chrome.settingsOpen}
                onClick={toggleSettings}
              >
                Settings
              </button>
              <SettingsPanel
                open={chrome.settingsOpen}
                prefs={prefs}
                onClose={chrome.closeSettings}
                onChange={updatePrefs}
                initialTab={section === "reader" ? "reading" : "appearance"}
              />
              <SlashMenu
                open={chrome.slashOpen}
                onClose={chrome.closeSlash}
                context={{
                  prefs,
                  currentSection: section,
                  onPrefs: updatePrefs,
                  onOpenSettings: chrome.openSettings,
                  onExportPrefs: () => downloadPrefs(prefs),
                  onNavigate: (href) => router.push(href),
                  reader: chrome.readerSlash ?? undefined,
                }}
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
