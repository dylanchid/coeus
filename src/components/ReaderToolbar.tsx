"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { TOPICS, type Topic } from "@/lib/feeds/sources";
import type { UserPrefs } from "@/lib/types";
import type { SettingsTab } from "./SettingsPanel";

type Props = {
  prefs: UserPrefs;
  topic: Topic;
  changeTopic: (topic: Topic) => void;
  persist: (patch: Partial<UserPrefs>) => void;
  openSettings: (tab?: SettingsTab) => void;
  refresh: () => void;
  loading: boolean;
  refreshing: boolean;
  categoriesOpen: boolean;
  setCategoriesOpen: Dispatch<SetStateAction<boolean>>;
  categoryOptions: string[];
  activeCategories: string[];
  multiSelect: boolean;
  changeMultiSelect: (selected: boolean) => void;
  toggleCategory: (tag: string) => void;
};

export function ReaderToolbar({
  prefs, topic, changeTopic, persist, openSettings, refresh,
  loading, refreshing, categoriesOpen, setCategoriesOpen, categoryOptions,
  activeCategories, multiSelect, changeMultiSelect, toggleCategory,
}: Props) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const viewLabel =
    prefs.homeView === "grid" ? "Grid"
      : prefs.homeView === "top" ? "Top"
        : prefs.homeView === "focus" ? "Focus" : "Ranked";

  return (
      <div className="toolbar">
        <div className="mobile-toolbar-row">
          <button type="button" onClick={() => changeTopic("all")}>
            {topic === "all"
              ? "All topics"
              : topic[0].toUpperCase() + topic.slice(1)}
          </button>
          <span aria-hidden="true">·</span>
          <span>{viewLabel}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="reader-filter-controls"
            onClick={() => setMobileFiltersOpen((value) => !value)}
          >
            View &amp; filters
          </button>
        </div>

        <div
          id="reader-filter-controls"
          className={`reader-filter-controls${mobileFiltersOpen ? " is-open" : ""}`}
        >
        <div className="view-switch" role="group" aria-label="Story view and ordering">
          <button
            type="button"
            className="toolbar-label"
            title="Open view settings"
            onClick={() => openSettings("reading")}
          >
            View
          </button>
          {(["grid", "top", "focus", "ranked"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={prefs.homeView === view}
              title={
                view === "grid"
                  ? "Grouped by source"
                  : view === "top"
                    ? "Balanced across sources"
                    : view === "focus"
                      ? "Newest stories first"
                      : "Personalized by your explicit rules"
              }
              onClick={() => persist({ homeView: view })}
            >
              {view === "grid"
                ? "Grid"
                : view === "top"
                  ? "Top"
                  : view === "focus"
                    ? "Focus"
                    : "Ranked"}
            </button>
          ))}
        </div>
        {prefs.homeView !== "grid" ? (
          <div
            className="representation-switch"
            role="group"
            aria-label="Story representation"
          >
            {(["compact", "detailed"] as const).map((representation) => (
              <button
                key={representation}
                type="button"
                aria-pressed={prefs.storyRepresentation === representation}
                onClick={() => persist({ storyRepresentation: representation })}
              >
                {representation === "compact" ? "Compact" : "Detailed"}
              </button>
            ))}
          </div>
        ) : null}
        <nav className="topics" aria-label="Topics">
          <button
            type="button"
            className="toolbar-label"
            title="Open sources settings"
            onClick={() => openSettings("sources")}
          >
            Sources
          </button>
          {TOPICS.map((t, i) => (
            <span key={t}>
              {i > 0 ? <span className="sep"> · </span> : null}
              <button
                type="button"
                aria-pressed={topic === t}
                onClick={() => changeTopic(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            </span>
          ))}
          <button
            type="button"
            className="category-toggle"
            aria-expanded={categoriesOpen}
            aria-controls="reader-categories"
            aria-label={
              activeCategories.length
                ? `Categories, ${activeCategories.length} selected`
                : "Categories"
            }
            title="Browse all categories"
            onClick={() => setCategoriesOpen((open) => !open)}
          >
            <span aria-hidden="true">{categoriesOpen ? "▴" : "▾"}</span>
            {activeCategories.length ? <span className="category-count">{activeCategories.length}</span> : null}
          </button>
          <span className="sep"> · </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || refreshing}
          >
            {loading || refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </nav>
        </div>
        {categoriesOpen ? (
          <div
            id="reader-categories"
            className="category-panel"
            role="group"
            aria-label="Categories"
            onKeyDown={(event) => {
              if (event.key === "Escape") setCategoriesOpen(false);
            }}
          >
            {categoryOptions.length ? (
              <div className="category-chips">
                <label className="category-multi">
                  <input
                    type="checkbox"
                    checked={multiSelect}
                    onChange={(event) => {
                      changeMultiSelect(event.target.checked);
                    }}
                  />
                  Multi-Select
                </label>
                {categoryOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={activeCategories.some((item) => item.toLowerCase() === tag.toLowerCase())}
                    onClick={() => toggleCategory(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : (
              <p className="category-empty">No categories for the loaded sources yet.</p>
            )}
          </div>
        ) : null}
      </div>

  );
}
