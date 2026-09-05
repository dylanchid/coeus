"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  FONT_OPTIONS,
  HOME_VIEW_OPTIONS,
  PALETTE_OPTIONS,
  STORY_REPRESENTATION_OPTIONS,
  mergeWithDefaults,
} from "@/lib/prefs";
import { allSources, orderByIds } from "@/lib/sources";
import type { SourceDef } from "@/lib/types";
import { formatKeywordRules, parseKeywordRules } from "@/lib/ranking";
import { AddSourceForm } from "./AddSourceForm";
import { useFocusReturn, useMediaQuery, useModalDialog } from "@/hooks/useModalDialog";
import type {
  ColumnCount,
  DensityId,
  HomeViewId,
  StoryRepresentationId,
  ThemeMode,
  UserPrefs,
} from "@/lib/types";

const LIMITS = [5, 10, 15, 25, 50] as const;
const HOURS = [1, 3, 6, 12, 24, 48, 72] as const;
const COLUMNS: ColumnCount[] = [1, 2, 3, 4];
const SETTINGS_TABS = ["reading", "appearance", "sources", "advanced"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

type Props = {
  open: boolean;
  prefs: UserPrefs;
  onClose: () => void;
  onChange: (patch: Partial<UserPrefs>) => void;
  initialTab?: SettingsTab;
};

function ChoiceRow<T extends string | number>({
  label,
  value,
  options,
  onPick,
  format = String,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onPick: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-choices">
        {options.map((opt, i) => (
          <span key={String(opt)}>
            {i > 0 ? <span className="sep"> · </span> : null}
            <button
              type="button"
              aria-pressed={value === opt}
              onClick={() => onPick(opt)}
            >
              {format(opt)}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="settings-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function RankingControls({
  prefs,
  orderedSources,
  onChange,
}: {
  prefs: UserPrefs;
  orderedSources: SourceDef[];
  onChange: (patch: Partial<UserPrefs>) => void;
}) {
  const [rulesText, setRulesText] = useState(() =>
    formatKeywordRules(prefs.keywordRules)
  );
  const knownSourceIds = new Set(orderedSources.map((source) => source.id));
  const nonemptyLineCount = rulesText
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
  const validRuleCount = parseKeywordRules(rulesText, knownSourceIds).length;

  const updateSourceWeight = (sourceId: string, weight: number) => {
    const sourceWeights = { ...prefs.sourceWeights };
    if (weight === 1) delete sourceWeights[sourceId];
    else sourceWeights[sourceId] = weight;
    onChange({ sourceWeights });
  };

  return (
    <section className="settings-section">
      <h3>Ranking</h3>
      <label className="settings-ranking-rules">
        <span>Keyword rules</span>
        <textarea
          value={rulesText}
          rows={5}
          spellCheck={false}
          placeholder={'AI +5\n"local-first" +8\ncrypto -4\n@hn Rust +3'}
          onChange={(event) => {
            const text = event.target.value;
            setRulesText(text);
            onChange({ keywordRules: parseKeywordRules(text, knownSourceIds) });
          }}
        />
      </label>
      <p className="settings-note">
        One rule per line. Weights run from −10 to +10. Prefix with a source ID,
        such as <code>@hn AI +5</code>, to scope a rule.
        {nonemptyLineCount > validRuleCount
          ? ` ${nonemptyLineCount - validRuleCount} invalid ${nonemptyLineCount - validRuleCount === 1 ? "line is" : "lines are"} ignored.`
          : ` ${validRuleCount} ${validRuleCount === 1 ? "rule" : "rules"} active.`}
      </p>
      <p className="settings-actions">
        <button
          type="button"
          disabled={!prefs.keywordRules.length}
          onClick={() => {
            setRulesText("");
            onChange({ keywordRules: [] });
          }}
        >
          Clear keyword rules
        </button>
        {" · "}
        <button
          type="button"
          disabled={!Object.keys(prefs.sourceWeights).length}
          onClick={() => onChange({ sourceWeights: {} })}
        >
          Reset source weights
        </button>
      </p>
      <ul className="settings-source-weights">
        {orderedSources.map((source) => {
          const weight = prefs.sourceWeights[source.id] ?? 1;
          return (
            <li key={source.id}>
              <label>
                <span>{source.name} <code>@{source.id}</code></span>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.25"
                  value={weight}
                  onChange={(event) =>
                    updateSourceWeight(source.id, Number(event.target.value))
                  }
                />
                <output>{weight.toFixed(2)}×</output>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SettingsPanel({
  open,
  prefs,
  onClose,
  onChange,
  initialTab = "reading",
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const mobileSheet = useMediaQuery("(max-width: 700px)");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [sourceQuery, setSourceQuery] = useState("");
  const hidden = new Set(prefs.hiddenSources);
  const enabledSources = allSources(prefs.customSources).filter((source) =>
    prefs.sourceOrder.includes(source.id)
  );
  const orderedSources = orderByIds(enabledSources, prefs.sourceOrder);
  const normalizedSourceQuery = sourceQuery.trim().toLowerCase();
  const filteredSources = orderedSources.filter((source) =>
    `${source.name} ${source.topic}`.toLowerCase().includes(normalizedSourceQuery)
  );

  useModalDialog({
    active: open && mobileSheet,
    containerRef: panelRef,
    initialFocusRef: closeRef,
    onClose,
  });
  useFocusReturn(open && !mobileSheet);

  useEffect(() => {
    if (!open || mobileSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) {
        // Ignore clicks on the toggle button (has data-settings-toggle)
        const el = e.target as HTMLElement | null;
        if (el?.closest?.("[data-settings-toggle]")) return;
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    // Delay so the opening click doesn't immediately close
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointer);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, mobileSheet, onClose]);

  if (!open) return null;

  const toggleHidden = (id: string) => {
    const set = new Set(prefs.hiddenSources);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ hiddenSources: [...set] });
  };

  const exportPrefs = () => {
    const blob = new Blob([JSON.stringify(prefs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bareaga-prefs.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPrefs = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("This file does not contain a preferences object.");
      }
      const raw = parsed as Partial<UserPrefs>;
      if (raw.version !== 1) {
        throw new Error("This preferences file uses an unsupported version.");
      }
      // Full replace via sanitized merge (not a shallow partial patch)
      onChange(mergeWithDefaults(raw));
      setImportStatus(`Imported ${file.name}.`);
    } catch (error) {
      setImportStatus(
        error instanceof SyntaxError
          ? "Import failed: choose a valid Bareaga JSON file."
          : `Import failed: ${error instanceof Error ? error.message : "the file could not be read."}`
      );
    }
  };

  const panel = (
    <div
      id="settings-popover"
      ref={panelRef}
      className="settings-panel"
      role={mobileSheet ? "dialog" : "region"}
      aria-modal={mobileSheet ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={mobileSheet ? -1 : undefined}
    >
      <header className="settings-head">
        <h2 id={titleId}>Settings</h2>
        <button ref={closeRef} type="button" className="settings-close" onClick={onClose}>
          Done
        </button>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div hidden={activeTab !== "reading"}>
      <section className="settings-section">
        <h3>Reading</h3>
        <ChoiceRow
          label="View"
          value={prefs.homeView}
          options={HOME_VIEW_OPTIONS.map((v) => v.id)}
          onPick={(homeView) => onChange({ homeView: homeView as HomeViewId })}
          format={(id) =>
            HOME_VIEW_OPTIONS.find((v) => v.id === id)?.label ?? String(id)
          }
        />
        {prefs.homeView === "grid" ? (
          <ChoiceRow
            label="Columns"
            value={prefs.columns}
            options={COLUMNS}
            onPick={(columns) => onChange({ columns })}
          />
        ) : (
          <ChoiceRow
            label="Stories"
            value={prefs.storyRepresentation}
            options={STORY_REPRESENTATION_OPTIONS.map((option) => option.id)}
            onPick={(storyRepresentation) =>
              onChange({
                storyRepresentation:
                  storyRepresentation as StoryRepresentationId,
              })
            }
            format={(id) =>
              STORY_REPRESENTATION_OPTIONS.find((option) => option.id === id)
                ?.label ?? String(id)
            }
          />
        )}
        <ChoiceRow
          label="Density"
          value={prefs.density}
          options={["comfortable", "compact"] as DensityId[]}
          onPick={(density) => onChange({ density })}
          format={(d) => (d === "comfortable" ? "Comfort" : "Compact")}
        />
        <dl className="mode-guide">
          <div><dt>Grid</dt><dd>Grouped by source</dd></div>
          <div><dt>Top</dt><dd>Balanced across sources</dd></div>
          <div><dt>Focus</dt><dd>Newest stories first</dd></div>
          <div><dt>Ranked</dt><dd>Your explicit rules, explained</dd></div>
        </dl>
      </section>

      {prefs.homeView === "grid" ? (
        <section className="settings-section">
          <h3>Grid details</h3>
          <ToggleRow
            label="Article summaries"
            checked={prefs.showSummaries}
            onChange={(showSummaries) => onChange({ showSummaries })}
          />
          <ToggleRow
            label="Authors"
            checked={prefs.showAuthors}
            onChange={(showAuthors) => onChange({ showAuthors })}
          />
          <ToggleRow
            label="Age labels"
            checked={prefs.showAges}
            onChange={(showAges) => onChange({ showAges })}
          />
          <ToggleRow
            label="Engagement"
            checked={prefs.showEngagement}
            onChange={(showEngagement) => onChange({ showEngagement })}
          />
        </section>
      ) : null}
      </div>

      <div hidden={activeTab !== "appearance"}>
      <section className="settings-section">
        <h3>Appearance</h3>
        <ChoiceRow
          label="Theme"
          value={prefs.theme}
          options={["system", "light", "dark"] as ThemeMode[]}
          onPick={(theme) => onChange({ theme })}
        />
        <ChoiceRow
          label="Palette"
          value={prefs.palette}
          options={PALETTE_OPTIONS.map((p) => p.id)}
          onPick={(palette) => onChange({ palette })}
          format={(id) =>
            PALETTE_OPTIONS.find((p) => p.id === id)?.label ?? String(id)
          }
        />
        <ChoiceRow
          label="Font"
          value={prefs.font}
          options={FONT_OPTIONS.map((f) => f.id)}
          onPick={(font) => onChange({ font })}
          format={(id) =>
            FONT_OPTIONS.find((f) => f.id === id)?.label ?? String(id)
          }
        />
        <article className="settings-preview" aria-label="Appearance preview">
          <span>Reuters · World · 12m</span>
          <strong>A sample story shows your choices live.</strong>
          <p>Muted details stay quiet while the headline remains clear.</p>
        </article>
      </section>
      </div>

      <div hidden={activeTab !== "advanced"}>
      <section className="settings-section">
        <h3>Feed window</h3>
        <ChoiceRow
          label="Limit"
          value={prefs.limit}
          options={LIMITS}
          onPick={(limit) => onChange({ limit })}
        />
        <ChoiceRow
          label="Time"
          value={prefs.hours}
          options={HOURS}
          onPick={(hours) => onChange({ hours })}
          format={(h) => `${h}h`}
        />
      </section>

      <RankingControls
        prefs={prefs}
        orderedSources={orderedSources}
        onChange={onChange}
      />
      </div>

      <div hidden={activeTab !== "sources"}>
      <section className="settings-section">
        <h3>Your feeds</h3>
        <AddSourceForm prefs={prefs} onChange={onChange} />
      </section>
      <section className="settings-section">
        <h3>Sources</h3>
        <label className="source-search-label" htmlFor="settings-source-search">
          Search sources
        </label>
        <input
          id="settings-source-search"
          className="source-search-input"
          type="search"
          value={sourceQuery}
          onChange={(event) => setSourceQuery(event.target.value)}
          placeholder="Name or topic"
        />
        <p className="settings-actions">
          <button
            type="button"
            onClick={() => onChange({ hiddenSources: [] })}
            disabled={prefs.hiddenSources.length === 0}
          >
            Show all
          </button>
          {" · "}
          <button
            type="button"
            onClick={() =>
              onChange({
                hiddenSources: orderedSources.map((s) => s.id),
              })
            }
            disabled={
              orderedSources.length > 0 &&
              orderedSources.every((source) => hidden.has(source.id))
            }
          >
            Hide all
          </button>
        </p>
        <ul className="settings-sources">
          {filteredSources.map((s) => {
            const isHidden = hidden.has(s.id);
            return (
              <li key={s.id} className={isHidden ? "is-hidden" : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={!isHidden}
                    onChange={() => toggleHidden(s.id)}
                  />
                  <span>{s.name}</span>
                  <span className="topic-tag">{s.topic}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>
      </div>

      <div hidden={activeTab !== "advanced"}>
      <section className="settings-section">
        <h3>Data</h3>
        <p className="settings-actions">
          <button type="button" onClick={exportPrefs}>
            Export prefs
          </button>
          {" · "}
          <label className="settings-file">
            Import
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void importPrefs(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </p>
        <p className="settings-note">
          Preferences stay in this browser. Escape closes this popover.
        </p>
        {importStatus ? (
          <p className="settings-import-status" role="status">
            {importStatus}
          </p>
        ) : null}
      </section>
      </div>
    </div>
  );

  return mobileSheet ? (
    <div
      className="settings-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panel}
    </div>
  ) : panel;
}
