"use client";

import {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useFeedQuery } from "@/hooks/useFeedQuery";
import { useNewsPrefs } from "@/hooks/useNewsPrefs";
import { useSearchField } from "@/hooks/useSearchField";
import { useBackToTop } from "@/hooks/useBackToTop";
import { useReaderCategories } from "@/hooks/useReaderCategories";
import { useReaderResults } from "@/hooks/useReaderResults";
import { useReaderStoryActions } from "@/hooks/useReaderStoryActions";
import { useArchive, usePreferences } from "./AppProviders";
import { useChrome } from "./ChromeProvider";
import { AppShell } from "./AppShell";
import { ReaderToolbar } from "./ReaderToolbar";
import { ReaderFeedback } from "./ReaderFeedback";
import { ReaderContent } from "./ReaderContent";
import { ReaderOverlays } from "./ReaderOverlays";
import { ReaderReturnBar } from "./ReaderReturnBar";

const EMPTY_SOURCE_IDS: string[] = [];

export function NewsApp() {
  const { prefs, updatePrefs } = usePreferences();
  const { archive, updateArchive } = useArchive();
  const { slashOpen, closeSlash, openSettings, setReaderSlash } = useChrome();
  const { topic, persist, changeTopic, onSearchChange } = useNewsPrefs(updatePrefs);
  const showBackToTop = useBackToTop();
  const actions = useReaderStoryActions({
    updateArchive,
    previewMode: prefs?.articlePreviewMode,
    persist,
  });
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

  const { deferredSearch, changeSearch, focusSearch } = useSearchField({
    prefs,
    onSearchChange,
    closeSlash,
    slashOpen,
    refresh,
  });

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
        onSearch: changeSearch,
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
    changeSearch,
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

  const {
    categoriesOpen, setCategoriesOpen, categoryOptions, activeCategories,
    categoryScoped, toggleCategory, multiSelect, changeMultiSelect, clearCategories,
  } = useReaderCategories(currentSources, prefs?.customSources);

  const savedArticleIds = useMemo(
    () => new Set((archive?.items ?? []).map((item) => item.articleId)),
    [archive]
  );
  const {
    visible, matchCount, matchSourceCount, failedSources,
    configuredSourceCount, statusText, emptyMessage,
  } = useReaderResults({
    sources: currentSources,
    scopedSources: categoryScoped,
    search: deferredSearch,
    prefs,
    topic,
    loading,
  });

  if (!prefs) {
    return <p className="boot">Loading…</p>;
  }

  return (
    <AppShell
      section="reader"
    >
      <ReaderToolbar
        prefs={prefs}
        topic={topic}
        changeTopic={changeTopic}
        persist={persist}
        openSettings={openSettings}
        refresh={refresh}
        loading={loading}
        refreshing={refreshing}
        categoriesOpen={categoriesOpen}
        setCategoriesOpen={setCategoriesOpen}
        categoryOptions={categoryOptions}
        activeCategories={activeCategories}
        multiSelect={multiSelect}
        changeMultiSelect={changeMultiSelect}
        toggleCategory={toggleCategory}
      />

      <ReaderFeedback
        statusText={statusText}
        loading={loading}
        refreshing={refreshing}
        activeCategories={activeCategories}
        clearCategories={clearCategories}
        search={deferredSearch}
        matchCount={matchCount}
        matchSourceCount={matchSourceCount}
        error={error}
        refresh={refresh}
        failedSources={failedSources}
      />

      <ReaderContent
        prefs={prefs}
        topic={topic}
        loading={loading}
        sources={currentSources}
        visible={visible}
        search={deferredSearch}
        matchCount={matchCount}
        emptyMessage={emptyMessage}
        configuredSourceCount={configuredSourceCount}
        clearSearch={() => changeSearch("")}
        openSources={() => openSettings("sources")}
        refresh={refresh}
        onReorder={onReorder}
        onRetry={retrySource}
        savedArticleIds={savedArticleIds}
        onSave={actions.saveStory}
        onShare={actions.shareStory}
        onOpen={actions.openStory}
      />

      <ReaderOverlays prefs={prefs} actions={actions} />

      <ReaderReturnBar show={showBackToTop} statusText={statusText} />

    </AppShell>
  );
}
