"use client";

import { HeaderMenu } from "./HeaderMenu";
import { DotsIcon } from "./HeaderIcons";

/** The ⋯ header control: settings and preference backup. */
export function SettingsMenu({
  onOpenSettings,
  onExportPrefs,
}: {
  onOpenSettings: () => void;
  onExportPrefs: () => void;
}) {
  return (
    <HeaderMenu
      label="Settings"
      triggerLabel="Settings menu"
      triggerClassName="header-icon-btn"
      trigger={<DotsIcon />}
      items={[
        { key: "settings", label: "Settings", onSelect: onOpenSettings },
        { key: "export", label: "Export preferences", onSelect: onExportPrefs },
      ]}
    />
  );
}
