"use client";

import { useMemo, useState } from "react";
import { SOURCE_CATALOG } from "@/lib/sources";
import type { SourceDef, UserPrefs } from "@/lib/types";
import { AddSourceForm } from "./AddSourceForm";
import { usePreferences } from "./AppProviders";
import { AppShell } from "./AppShell";

const FEATURED_CATEGORIES = [
  "all",
  "AI",
  "security",
  "open source",
  "hardware",
  "startups",
  "programming",
  "world",
  "US",
  "politics",
  "policy",
  "conflict",
  "local",
  "markets",
  "labor",
  "energy",
  "climate",
  "space",
  "medicine",
  "biology",
  "physics",
  "culture",
  "history",
  "books",
  "literature",
  "art",
  "music",
  "film",
  "photography",
  "architecture",
  "design",
  "theater",
  "dance",
  "museums",
  "archives",
  "archaeology",
  "ideas",
  "philosophy",
  "education",
  "primary sources",
] as const;

type SortMode = "featured" | "fresh" | "deep" | "undiscovered" | "rated" | "az";

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "rated", label: "Your rating" },
  { id: "fresh", label: "Freshest" },
  { id: "deep", label: "Deepest" },
  { id: "undiscovered", label: "Undiscovered" },
  { id: "az", label: "A–Z" },
];

function unique(field: (source: SourceDef) => string): string[] {
  return [...new Set(SOURCE_CATALOG.map(field))].sort((a, b) => a.localeCompare(b));
}

const LANGUAGES = unique((source) => source.language);
const REGIONS = unique((source) => source.region);
const SOURCE_TYPES = unique((source) => source.sourceType);

function matchesCategory(source: SourceDef, category: string): boolean {
  if (category === "all") return true;
  if (category === "primary sources") return source.sourceType === "primary-source";
  return source.topics.some((topic) => topic.toLowerCase() === category.toLowerCase());
}

function compareSources(a: SourceDef, b: SourceDef, sort: SortMode, prefs: UserPrefs) {
  if (sort === "az") return a.name.localeCompare(b.name);
  if (sort === "fresh") {
    const cadence = { live: 0, daily: 1, weekly: 2 };
    return cadence[a.cadence] - cadence[b.cadence] || a.defaultRank - b.defaultRank;
  }
  if (sort === "deep") {
    const depth = { deep: 0, mixed: 1, brief: 2 };
    return depth[a.depth] - depth[b.depth] || a.defaultRank - b.defaultRank;
  }
  if (sort === "undiscovered") {
    const aAdded = prefs.sourceOrder.includes(a.id) ? 1 : 0;
    const bAdded = prefs.sourceOrder.includes(b.id) ? 1 : 0;
    return aAdded - bAdded || a.defaultRank - b.defaultRank;
  }
  if (sort === "rated") {
    return (prefs.sourceRatings[b.id] ?? 0) - (prefs.sourceRatings[a.id] ?? 0) || a.defaultRank - b.defaultRank;
  }
  return a.defaultRank - b.defaultRank;
}

export function SourcesApp() {
  const { prefs, updatePrefs: setSharedPrefs } = usePreferences();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortMode>("featured");
  const [language, setLanguage] = useState("all");
  const [region, setRegion] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [cadence, setCadence] = useState("all");

  const updatePrefs = (update: (current: UserPrefs) => UserPrefs) => {
    setSharedPrefs(update);
  };

  const filtered = useMemo(() => {
    if (!prefs) return [];
    const needle = query.trim().toLowerCase();
    return SOURCE_CATALOG.filter((source) => {
      if (!matchesCategory(source, category)) return false;
      if (language !== "all" && source.language !== language) return false;
      if (region !== "all" && source.region !== region) return false;
      if (sourceType !== "all" && source.sourceType !== sourceType) return false;
      if (cadence !== "all" && source.cadence !== cadence) return false;
      if (!needle) return true;
      return [
        source.name,
        source.description,
        source.region,
        source.language,
        source.sourceType,
        ...source.topics,
        ...source.tags,
      ].some((value) => value.toLowerCase().includes(needle));
    }).sort((a, b) => compareSources(a, b, sort, prefs));
  }, [prefs, query, category, language, region, sourceType, cadence, sort]);

  if (!prefs) return <p className="boot">Loading source directory…</p>;

  const enabled = new Set(prefs.sourceOrder);
  const activeFilterCount = [language, region, sourceType, cadence].filter(
    (value) => value !== "all"
  ).length;

  const toggleSource = (id: string) => {
    updatePrefs((current) => {
      const isEnabled = current.sourceOrder.includes(id);
      if (!isEnabled) {
        return {
          ...current,
          sourceOrder: [...current.sourceOrder, id],
          hiddenSources: current.hiddenSources.filter((sourceId) => sourceId !== id),
        };
      }
      const sourceWeights = { ...current.sourceWeights };
      delete sourceWeights[id];
      return {
        ...current,
        sourceOrder: current.sourceOrder.filter((sourceId) => sourceId !== id),
        hiddenSources: current.hiddenSources.filter((sourceId) => sourceId !== id),
        sourceWeights,
      };
    });
  };

  const rateSource = (id: string, rating: number) => {
    updatePrefs((current) => {
      const sourceRatings = { ...current.sourceRatings };
      if (rating === 0) delete sourceRatings[id];
      else sourceRatings[id] = rating;
      return { ...current, sourceRatings };
    });
  };

  return (
    <AppShell section="sources">
      <div className="discover-page">
      <section className="sources-intro" aria-labelledby="sources-title">
        <p>Sources for your Reader</p>
        <h1 id="sources-title">Find publications worth following.</h1>
        <span>Browse the directory or bring any RSS or Atom feed.</span>
      </section>
      <section className="discover-section discover-add" aria-label="Add your own feed">
        <AddSourceForm prefs={prefs} onChange={setSharedPrefs} />
      </section>
      <section className="discover-controls" aria-label="Source filters">
        <label className="discover-search">
          <span>Search the directory</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Source, topic, tag, or region"
          />
        </label>
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </section>

      <nav className="discover-categories" aria-label="Source categories">
        {FEATURED_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item === "all" ? "All sources" : item}
          </button>
        ))}
      </nav>

      <div className="discover-workspace">
        <aside className="discover-filters">
          <div>
            <strong>Filters</strong>
            <span>{activeFilterCount || "—"}</span>
          </div>
          <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="all">All languages</option>{LANGUAGES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option value="all">All regions</option>{REGIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Source type</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="all">All types</option>{SOURCE_TYPES.map((value) => <option key={value}>{value.replace("-", " ")}</option>)}</select></label>
          <label><span>Update cadence</span><select value={cadence} onChange={(event) => setCadence(event.target.value)}><option value="all">Any cadence</option><option value="live">Live</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <button
            type="button"
            disabled={!activeFilterCount}
            onClick={() => { setLanguage("all"); setRegion("all"); setSourceType("all"); setCadence("all"); }}
          >Clear filters</button>
          <p>{enabled.size} sources in your reader.</p>
        </aside>

        <section className="discover-results" aria-live="polite">
          <header>
            <p><strong>{filtered.length}</strong> {filtered.length === 1 ? "source" : "sources"}</p>
            <p>Ratings are yours alone · Directory ranks are editorial</p>
          </header>
          {filtered.length ? (
            <ol className="source-directory">
              {filtered.map((source, index) => {
                const isEnabled = enabled.has(source.id);
                const rating = prefs.sourceRatings[source.id] ?? 0;
                return (
                  <li key={source.id} className={isEnabled ? "is-added" : undefined}>
                    <span className="source-directory-rank">{String(index + 1).padStart(2, "0")}</span>
                    <div className="source-directory-main">
                      <div className="source-directory-title">
                        <h2>{source.name}</h2>
                        <span>{source.region} · {source.language}</span>
                      </div>
                      <p>{source.description}</p>
                      <div className="source-directory-tags">
                        {source.topics.slice(0, 3).map((topic) => <button key={topic} type="button" onClick={() => setCategory(topic)}>{topic}</button>)}
                        {source.tags.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}
                      </div>
                    </div>
                    <div className="source-directory-meta">
                      <span className="feed-ready"><i aria-hidden="true" /> RSS configured</span>
                      <span>{source.cadence} · {source.depth}</span>
                      <label>
                        <span>Your rating</span>
                        <select aria-label={`Your rating for ${source.name}`} value={rating} onChange={(event) => rateSource(source.id, Number(event.target.value))}>
                          <option value="0">Unrated</option>
                          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="source-directory-actions">
                      <button type="button" className={isEnabled ? "is-added" : undefined} onClick={() => toggleSource(source.id)}>{isEnabled ? "Added ✓" : "+ Add"}</button>
                      <a href={source.homeUrl} target="_blank" rel="noreferrer">Preview ↗</a>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="discover-empty">
              <h2>No matching sources.</h2>
              <p>Try a broader category or clear one of the directory filters.</p>
            </div>
          )}
        </section>
      </div>
      </div>
    </AppShell>
  );
}
