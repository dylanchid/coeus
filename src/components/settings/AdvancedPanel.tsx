import { useState } from "react";
import { allSources, orderByIds } from "@/lib/feeds/sources";
import { mergeWithDefaults } from "@/lib/prefs";
import type { UserPrefs } from "@/lib/types";
import { ChoiceRow, type SettingsChange } from "./SettingsControls";
import { RankingControls } from "./RankingControls";

const LIMITS = [5, 10, 15, 25, 50] as const;
const HOURS = [1, 3, 6, 12, 24, 48, 72] as const;

export function AdvancedPanel({ prefs, onChange }: { prefs: UserPrefs; onChange: SettingsChange }) {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const enabledSources = allSources(prefs.customSources).filter((source) => prefs.sourceOrder.includes(source.id));
  const orderedSources = orderByIds(enabledSources, prefs.sourceOrder);

  const exportPrefs = () => {
    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "coeus-prefs.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importPrefs = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("This file does not contain a preferences object.");
      const raw = parsed as Partial<UserPrefs>;
      if (raw.version !== 1) throw new Error("This preferences file uses an unsupported version.");
      onChange(mergeWithDefaults(raw));
      setImportStatus(`Imported ${file.name}.`);
    } catch (error) {
      setImportStatus(error instanceof SyntaxError
        ? "Import failed: choose a valid Coeus JSON file."
        : `Import failed: ${error instanceof Error ? error.message : "the file could not be read."}`);
    }
  };

  return <>
    <section className="settings-section">
      <h3>Feed window</h3>
      <ChoiceRow label="Limit" value={prefs.limit} options={LIMITS} onPick={(limit) => onChange({ limit })} />
      <ChoiceRow label="Time" value={prefs.hours} options={HOURS} onPick={(hours) => onChange({ hours })}
        format={(hours) => `${hours}h`} />
    </section>
    <RankingControls prefs={prefs} orderedSources={orderedSources} onChange={onChange} />
    <section className="settings-section">
      <h3>Data</h3>
      <p className="settings-actions">
        <button type="button" onClick={exportPrefs}>Export prefs</button>
        {" · "}
        <label className="settings-file">
          Import
          <input type="file" accept="application/json,.json" hidden onChange={(event) => {
            void importPrefs(event.target.files?.[0] ?? null);
            event.target.value = "";
          }} />
        </label>
      </p>
      <p className="settings-note">Preferences stay in this browser. Escape closes this popover.</p>
      {importStatus ? <p className="settings-import-status" role="status">{importStatus}</p> : null}
    </section>
  </>;
}
