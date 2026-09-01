"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { TOPICS, type Topic } from "@/lib/sources";
import { countMatches, filterSources } from "@/lib/search";
import { visibleSourceIds } from "@/lib/feedQuery";
import type { Article, UserPrefs } from "@/lib/types";
import { archiveArticle } from "@/lib/archive";
import { useFeedQuery } from "@/hooks/useFeedQuery";
import { useArchive, usePreferences } from "./AppProviders";
import { PrimaryNav } from "./PrimaryNav";
import { SearchBar } from "./SearchBar";
import { SettingsPanel } from "./SettingsPanel";
import { SlashMenu } from "./SlashMenu";
import { SourceGrid } from "./SourceGrid";
import { StoryFeed } from "./StoryFeed";
import { ShareSheet } from "./ShareSheet";

function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NewsApp() {
  const { prefs, updatePrefs } = usePreferences();
  const { archive, updateArchive } = useArchive();
  const [topic, setTopic] = useState<Topic>("all");
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ article: Article; sourceName: string; topic: string } | null>(null);
  const [shareStatus, setShareStatus] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchHydrated = useRef(false);

  const openSlash = useCallback(() => {
    setSettingsOpen(false);
    setSlashOpen(true);
  }, []);

  const closeSlash = useCallback(() => setSlashOpen(false), []);

  const exportPrefs = useCallback(() => {
    if (!prefs) return;
    const blob = new Blob([JSON.stringify(prefs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bareaga-prefs.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [prefs]);

  const focusSearch = useCallback(() => {
    setSlashOpen(false);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, []);

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
    updatedAt,
    loading,
    refreshing,
    error,
    refresh,
    retrySource,
    reorderSources,
  } = useFeedQuery({
    sourceOrder: prefs?.sourceOrder ?? [],
    hiddenSources: prefs?.hiddenSources ?? [],
    limit,
    hours,
    topic,
  });

  // `/` or ⌘K → slash menu; `,` settings; `r` refresh; `?` focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable;

      // Command palette: / (when not typing) or Cmd/Ctrl+K always
      if (
        (e.key === "k" || e.key === "K") &&
        (e.metaKey || e.ctrlKey) &&
        !e.altKey
      ) {
        e.preventDefault();
        setSlashOpen((v) => {
          if (v) return false;
          setSettingsOpen(false);
          return true;
        });
        return;
      }

      if (slashOpen) return; // SlashMenu owns keys while open

      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        openSlash();
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        setSlashOpen(false);
        setSettingsOpen((v) => !v);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slashOpen, openSlash, focusSearch, refresh]);

  const onSearchChange = (value: string) => {
    setSearch(value);
    persist({ lastSearch: value });
  };

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

  const visible = useMemo(
    () => filterSources(currentSources, deferredSearch),
    [currentSources, deferredSearch]
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
    () => countMatches(currentSources, deferredSearch),
    [currentSources, deferredSearch]
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
    <>
      <header className="site-header">
        <div className="header-main">
          <div className="header-brand">
            <h1>
              <Link href="/">Bareaga</Link>
            </h1>
          </div>
          <div className="header-sub">
            <p className="tagline">
              Headlines, bare. Search, arrange &amp; balance. Updated{" "}
              {formatUpdated(updatedAt)}
              {loading && currentSources.length === 0
                ? " · loading…"
                : refreshing
                  ? " · updating…"
                  : null}
            </p>
            <div className="header-actions">
              <PrimaryNav current="reader" archiveCount={savedArticleIds.size} readerStyle />
              <button
                type="button"
                className="slash-toggle"
                data-slash-toggle
                aria-expanded={slashOpen}
                aria-haspopup="dialog"
                title="Slash menu (/ or ⌘K)"
                onClick={() => {
                  if (slashOpen) closeSlash();
                  else openSlash();
                }}
              >
                /
              </button>
              <button
                type="button"
                className="settings-toggle"
                data-settings-toggle
                aria-controls="settings-popover"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setSlashOpen(false);
                  setSettingsOpen((v) => !v);
                }}
              >
                Settings
              </button>
              <SettingsPanel
                open={settingsOpen}
                prefs={prefs}
                onClose={() => setSettingsOpen(false)}
                onChange={persist}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <SearchBar
          ref={searchInputRef}
          value={search}
          matchCount={matchCount}
          matchSourceCount={matchSourceCount}
          totalCount={totalCount}
          onChange={onSearchChange}
        />

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
      </div>

      <p className="feed-status" role="status" aria-live="polite" aria-atomic="true">
        <span>{statusText}</span>
        {loading || refreshing ? (
          <span className="status-working">Loading next batch…</span>
        ) : null}
        {deferredSearch.trim() ? (
          <span>{matchCount} shown across {matchSourceCount} sources</span>
        ) : null}
      </p>

      <SlashMenu
        open={slashOpen}
        onClose={closeSlash}
        context={{
          prefs,
          topic,
          search,
          sources: currentSources,
          busy: loading || refreshing,
          onPrefs: persist,
          onTopic: changeTopic,
          onSearch: onSearchChange,
          onRefresh: () => void refresh(),
          onOpenSettings: () => setSettingsOpen(true),
          onFocusSearch: focusSearch,
          onExportPrefs: exportPrefs,
        }}
      />

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

      <footer className="site-footer">
        <p>
          Bareaga — standalone RSS reader inspired by{" "}
          <a
            href="https://brutalist.report/"
            target="_blank"
            rel="noreferrer"
          >
            brutalist.report
          </a>
          . Not affiliated.
        </p>
      </footer>
    </>
  );
}
