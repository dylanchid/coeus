"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TOPICS, sourceByIdMap, type Topic } from "@/lib/sources";
import { countMatches, filterSources } from "@/lib/search";
import { visibleSourceIds } from "@/lib/feedQuery";
import type { Article, EmbedCompatibility, UserPrefs } from "@/lib/types";
import { archiveArticle } from "@/lib/archive";
import { useFeedQuery } from "@/hooks/useFeedQuery";
import { useArchive, usePreferences } from "./AppProviders";
import { useChrome } from "./ChromeProvider";
import { AppShell } from "./AppShell";
import { FOCUS_HEADER_SEARCH_EVENT } from "./HeaderSearch";
import { SourceGrid } from "./SourceGrid";
import { StoryFeed } from "./StoryFeed";
import { ShareSheet } from "./ShareSheet";
import { ArticlePreview, ArticlePreviewChoice } from "./ArticlePreview";

const EMPTY_SOURCE_IDS: string[] = [];

/**
 * Resolves the framing policy for one article URL. A failed or ambiguous check
 * returns "unknown", which the preview modal renders as the static fallback
 * rather than skipping the preview entirely.
 */
async function resolveEmbedCompatibility(url: string): Promise<EmbedCompatibility> {
  try {
    const response = await fetch(`/api/embed-compatibility?url=${encodeURIComponent(url)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return "unknown";
    const data = (await response.json()) as { compatibility?: EmbedCompatibility };
    return data.compatibility === "allowed" || data.compatibility === "blocked"
      ? data.compatibility
      : "unknown";
  } catch {
    return "unknown";
  }
}


export function NewsApp() {
  const { prefs, updatePrefs } = usePreferences();
  const { archive, updateArchive } = useArchive();
  const { slashOpen, closeSlash, openSettings, setReaderSlash } = useChrome();
  const [topic, setTopic] = useState<Topic>("all");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(true);
  const [search, setSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ article: Article; sourceName: string; topic: string } | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const [previewTarget, setPreviewTarget] = useState<{ article: Article; sourceName: string; sourceHomeUrl?: string; sourceTopic: string; compatibility: EmbedCompatibility } | null>(null);
  const searchHydrated = useRef(false);

  const focusSearch = useCallback(() => {
    closeSlash();
    window.dispatchEvent(new CustomEvent(FOCUS_HEADER_SEARCH_EVENT, { detail: { command: false } }));
  }, [closeSlash]);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!prefs || searchHydrated.current) return;
    searchHydrated.current = true;
    setSearch(prefs.lastSearch);
  }, [prefs]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const persist = useCallback((patch: Partial<UserPrefs>) => {
    updatePrefs(patch);
  }, [updatePrefs]);

  const changeTopic = useCallback((nextTopic: Topic) => {
    setTopic(nextTopic);
  }, []);

  const limit = prefs?.limit ?? 10;
  const hours = prefs?.hours ?? 24;
  const {
    sources: currentSources,
    loading,
    refreshing,
    error,
    refresh,
    retrySource,
    reorderSources,
  } = useFeedQuery({
    sourceOrder: prefs?.sourceOrder ?? EMPTY_SOURCE_IDS,
    hiddenSources: prefs?.hiddenSources ?? EMPTY_SOURCE_IDS,
    limit,
    hours,
    topic,
    customSources: prefs?.customSources,
  });

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    persist({ lastSearch: value });
  }, [persist]);

  // Reader-only shortcuts: `r` refreshes feeds, `?` focuses search.
  // The command palette (`/`, `⌘K`) and Settings (`,`) live in SiteHeader.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (slashOpen) return; // SlashMenu owns keys while open
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slashOpen, focusSearch, refresh]);

  // Register Reader slash commands. Only clear on unmount — clearing on every
  // dependency change retriggered Chrome state and looped the tree.
  useEffect(() => {
    if (!prefs) return;
    const busy = loading || refreshing;
    setReaderSlash((previous) => {
      if (
        previous &&
        previous.topic === topic &&
        previous.sources === currentSources &&
        previous.busy === busy
      ) {
        return previous;
      }
      return {
        topic,
        sources: currentSources,
        busy,
        onTopic: changeTopic,
        onSearch: onSearchChange,
        onRefresh: () => {
          void refresh();
        },
        onFocusSearch: focusSearch,
      };
    });
  }, [
    prefs,
    topic,
    currentSources,
    loading,
    refreshing,
    changeTopic,
    onSearchChange,
    refresh,
    focusSearch,
    setReaderSlash,
  ]);

  useEffect(() => () => setReaderSlash(null), [setReaderSlash]);

  const onReorder = useCallback(
    (orderedIds: string[]) => {
      if (!prefs) return;
      const displayed = new Set(orderedIds);
      const nextOrder: string[] = [];
      let orderedIndex = 0;
      for (const id of prefs.sourceOrder) {
        nextOrder.push(
          displayed.has(id) ? (orderedIds[orderedIndex++] ?? id) : id
        );
      }
      for (const id of orderedIds) {
        if (!nextOrder.includes(id)) nextOrder.push(id);
      }
      persist({ sourceOrder: nextOrder });
      reorderSources(nextOrder);
    },
    [prefs, persist, reorderSources]
  );

  const saveStory = useCallback((article: Article, sourceName: string, sourceTopic: string) => {
    updateArchive((current) => archiveArticle(current, article, sourceName, sourceTopic));
  }, [updateArchive]);

  const shareStory = useCallback((article: Article, sourceName: string, sourceTopic: string) => {
    setShareTarget({ article, sourceName, topic: sourceTopic });
  }, []);

  const openOriginal = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openStory = useCallback((article: Article, sourceName: string, sourceHomeUrl: string | undefined, sourceTopic: string) => {
    if (prefs?.articlePreviewMode === "external") {
      openOriginal(article.url);
      return;
    }
    // Open immediately in the fallback-safe "unknown" state, then upgrade to an
    // inline frame only if this article's own headers confirm framing is allowed.
    setPreviewTarget({ article, sourceName, sourceHomeUrl, sourceTopic, compatibility: "unknown" });
    void resolveEmbedCompatibility(article.url).then((compatibility) => {
      setPreviewTarget((current) =>
        current && current.article.url === article.url ? { ...current, compatibility } : current,
      );
    });
  }, [openOriginal, prefs?.articlePreviewMode]);

  // Sub-categories are the finer `topics` tags on each loaded source; they
  // narrow whichever top-level topic is active.
  const categoryTagsBySource = useMemo(() => {
    const defs = sourceByIdMap(prefs?.customSources);
    return new Map(currentSources.map((source) => [source.id, defs.get(source.id)?.topics ?? []]));
  }, [currentSources, prefs?.customSources]);
  const categoryOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const tags of categoryTagsBySource.values()) {
      for (const tag of tags) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [categoryTagsBySource]);
  const activeCategories = useMemo(
    () => categories.filter((tag) => categoryOptions.some((option) => option.toLowerCase() === tag.toLowerCase())),
    [categories, categoryOptions]
  );
  const categoryScoped = useMemo(() => {
    if (activeCategories.length === 0) return currentSources;
    const wanted = new Set(activeCategories.map((tag) => tag.toLowerCase()));
    return currentSources.filter((source) =>
      (categoryTagsBySource.get(source.id) ?? []).some((tag) => wanted.has(tag.toLowerCase()))
    );
  }, [currentSources, categoryTagsBySource, activeCategories]);
  const toggleCategory = useCallback((tag: string) => {
    setCategories((current) => {
      const selected = current.some((item) => item.toLowerCase() === tag.toLowerCase());
      if (selected) return current.filter((item) => item.toLowerCase() !== tag.toLowerCase());
      return multiSelect ? [...current, tag] : [tag];
    });
  }, [multiSelect]);

  const visible = useMemo(
    () => filterSources(categoryScoped, deferredSearch),
    [categoryScoped, deferredSearch]
  );
  const savedArticleIds = useMemo(
    () => new Set((archive?.items ?? []).map((item) => item.articleId)),
    [archive]
  );

  const totalCount = useMemo(
    () => currentSources.reduce((n, s) => n + s.articles.length, 0),
    [currentSources]
  );
  const matchCount = useMemo(
    () => countMatches(categoryScoped, deferredSearch),
    [categoryScoped, deferredSearch]
  );
  const matchSourceCount = useMemo(
    () => visible.filter((source) => source.articles.length > 0).length,
    [visible]
  );

  const failedSources = useMemo(
    () => currentSources.filter((s) => Boolean(s.error)),
    [currentSources]
  );

  const emptyMessage = useMemo(() => {
    if (!prefs) return undefined;
    const hidden = new Set(prefs.hiddenSources);
    const remaining = visibleSourceIds(prefs.sourceOrder, hidden, topic);
    if (prefs.sourceOrder.every((id) => hidden.has(id))) {
      return "All sources are hidden. Open Settings → Sources.";
    }
    if (topic !== "all" && remaining.length === 0 && !loading) {
      return `No visible sources for “${topic}”. Adjust Sources in Settings.`;
    }
    if (deferredSearch.trim()) {
      return "No sources match this search. Try different keywords or clear.";
    }
    if (!loading && currentSources.length === 0) {
      return "No sources loaded yet. Try Refresh.";
    }
    return undefined;
  }, [prefs, topic, deferredSearch, loading, currentSources.length]);

  if (!prefs) {
    return <p className="boot">Loading…</p>;
  }

  const configuredSourceCount = visibleSourceIds(
    prefs.sourceOrder,
    new Set(prefs.hiddenSources),
    topic
  ).length;
  const loadedSourceCount = currentSources.length - failedSources.length;
  const statusText = `${loadedSourceCount} of ${configuredSourceCount} sources loaded · ${totalCount} ${totalCount === 1 ? "story" : "stories"}${failedSources.length ? ` · ${failedSources.length} failed` : ""}`;
  const viewLabel =
    prefs.homeView === "grid"
      ? "Grid"
      : prefs.homeView === "top"
        ? "Top"
        : prefs.homeView === "focus"
          ? "Focus"
          : "Ranked";

  return (
    <AppShell
      section="reader"
    >
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
                      setMultiSelect(event.target.checked);
                      if (!event.target.checked) setCategories((current) => current.slice(0, 1));
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

      <p className="feed-status" role="status" aria-live="polite" aria-atomic="true">
        <span>{statusText}</span>
        {loading || refreshing ? (
          <span className="status-working">Loading next batch…</span>
        ) : null}
        {activeCategories.length ? (
          <span>
            Filtered to {activeCategories.join(", ")} ·{" "}
            <button type="button" onClick={() => setCategories([])}>clear</button>
          </span>
        ) : null}
        {deferredSearch.trim() ? (
          <span>{matchCount} shown across {matchSourceCount} sources</span>
        ) : null}
      </p>

      {error ? (
        <p className="banner-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      ) : null}

      {failedSources.length > 0 ? (
        <p className="banner-warn" role="status">
          Some publishers could not be reached: {failedSources
            .map((source) => `${source.name} (${source.error})`)
            .join("; ")}. Other stories are still available.
        </p>
      ) : null}

      {loading && currentSources.length === 0 ? (
        <div className="feed-loading" role="status" aria-live="polite">
          <p>Loading {topic === "all" ? "the latest" : topic} stories…</p>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      ) : prefs.homeView === "grid" ? (
        <SourceGrid
          sources={visible}
          highlightQuery={deferredSearch}
          emptyMessage={emptyMessage}
          showSummaries={prefs.showSummaries}
          showAuthors={prefs.showAuthors}
          showAges={prefs.showAges}
          showEngagement={prefs.showEngagement}
          onReorder={onReorder}
          onRetry={retrySource}
          savedArticleIds={savedArticleIds}
          onSave={saveStory}
          onShare={shareStory}
          onOpen={openStory}
        />
      ) : (
        <StoryFeed
          sources={visible}
          view={prefs.homeView}
          representation={prefs.storyRepresentation}
          highlightQuery={deferredSearch}
          keywordRules={prefs.keywordRules}
          sourceWeights={prefs.sourceWeights}
          emptyMessage={emptyMessage}
          savedArticleIds={savedArticleIds}
          onSave={saveStory}
          onShare={shareStory}
          onOpen={openStory}
        />
      )}

      {shareTarget ? (
        <ShareSheet
          article={shareTarget.article}
          sourceName={shareTarget.sourceName}
          topic={shareTarget.topic}
          onClose={() => setShareTarget(null)}
          onDone={(message) => {
            setShareStatus(message);
            window.setTimeout(() => setShareStatus(""), 2800);
          }}
        />
      ) : null}
      {previewTarget && prefs.articlePreviewMode === "ask" ? (
        <ArticlePreviewChoice
          article={previewTarget.article}
          sourceName={previewTarget.sourceName}
          onClose={() => setPreviewTarget(null)}
          onChoosePreview={() => persist({ articlePreviewMode: "preview" })}
          onChooseExternal={() => {
            persist({ articlePreviewMode: "external" });
            openOriginal(previewTarget.article.url);
            setPreviewTarget(null);
          }}
        />
      ) : null}
      {previewTarget && prefs.articlePreviewMode === "preview" ? (
        <ArticlePreview
          article={previewTarget.article}
          sourceName={previewTarget.sourceName}
          sourceHomeUrl={previewTarget.sourceHomeUrl}
          sourceTopic={previewTarget.sourceTopic}
          compatibility={previewTarget.compatibility}
          onClose={() => setPreviewTarget(null)}
          onOpenOriginal={() => openOriginal(previewTarget.article.url)}
          onPreferExternal={() => {
            persist({ articlePreviewMode: "external" });
            setPreviewTarget(null);
          }}
        />
      ) : null}
      {shareStatus ? <p className="share-toast" role="status">{shareStatus}</p> : null}

      {showBackToTop ? (
        <div className="reader-return-bar" role="region" aria-label="Reader position">
          <span>{statusText}</span>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to top ↑
          </button>
        </div>
      ) : null}

    </AppShell>
  );
}
