"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFocusReturn, useMediaQuery, useModalDialog } from "@/hooks/useModalDialog";
import type { UserPrefs } from "@/lib/types";
import { UiDialog } from "./ui/Dialog";
import { ReadingPanel } from "./settings/ReadingPanel";
import { AppearancePanel } from "./settings/AppearancePanel";
import { SourcesPanel } from "./settings/SourcesPanel";
import { AdvancedPanel } from "./settings/AdvancedPanel";

const SETTINGS_TABS = ["reading", "appearance", "sources", "advanced"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

type Props = {
  open: boolean;
  prefs: UserPrefs;
  onClose: () => void;
  onChange: (patch: Partial<UserPrefs>) => void;
  initialTab?: SettingsTab;
  /** Tab requested by whoever opened the panel; applied each time it opens. */
  tab?: SettingsTab | null;
};

export function SettingsPanel({ open, prefs, onClose, onChange, initialTab = "reading", tab = null }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mobileSheet = useMediaQuery("(max-width: 700px)");
  const [mobileReady, setMobileReady] = useState(false);
  const attachMobilePanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setMobileReady(Boolean(node));
  }, []);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [wasOpen, setWasOpen] = useState(open);

  // The requested tab is applied on each open, before paint.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && tab) setActiveTab(tab);
  }

  useFocusReturn(open && !mobileSheet);
  useModalDialog({ active: open && mobileSheet && mobileReady, containerRef: panelRef, onClose });
  useEffect(() => {
    if (!open || mobileSheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-settings-toggle]")) return;
      if (panelRef.current && target && !panelRef.current.contains(target)) onClose();
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => window.addEventListener("mousedown", onPointer), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, mobileSheet, onClose]);

  if (!open) return null;

  const content = <>
    <header className="settings-head">
      <h2 id={titleId}>Settings</h2>
      {mobileSheet ? (
        <UiDialog.Close className="settings-close">Done</UiDialog.Close>
      ) : (
        <button type="button" className="settings-close" onClick={onClose}>Done</button>
      )}
    </header>
    <nav className="settings-tabs" aria-label="Settings sections">
      {SETTINGS_TABS.map((section) => (
        <button key={section} type="button" aria-pressed={activeTab === section}
          onClick={() => setActiveTab(section)}>
          {section[0].toUpperCase() + section.slice(1)}
        </button>
      ))}
    </nav>
    <div hidden={activeTab !== "reading"}><ReadingPanel prefs={prefs} onChange={onChange} /></div>
    <div hidden={activeTab !== "appearance"}><AppearancePanel prefs={prefs} onChange={onChange} /></div>
    <div hidden={activeTab !== "advanced"}><AdvancedPanel prefs={prefs} onChange={onChange} /></div>
    <div hidden={activeTab !== "sources"}><SourcesPanel prefs={prefs} onChange={onChange} /></div>
  </>;

  return mobileSheet ? (
    <UiDialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <UiDialog.Portal>
        <UiDialog.Backdrop className="settings-overlay" />
        <UiDialog.Popup id="settings-popover" ref={attachMobilePanel} className="settings-panel" aria-modal="true" aria-labelledby={titleId}>
          {content}
        </UiDialog.Popup>
      </UiDialog.Portal>
    </UiDialog.Root>
  ) : (
    <div id="settings-popover" ref={panelRef} className="settings-panel" role="region" aria-labelledby={titleId}>
      {content}
    </div>
  );
}
