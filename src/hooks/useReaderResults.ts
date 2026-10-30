"use client";

import { useMemo } from "react";
import { visibleSourceIds } from "@/lib/feeds/feedQuery";
import { countMatches, filterSources } from "@/lib/feeds/search";
import type { Topic } from "@/lib/feeds/sources";
import type { SourceFeed, UserPrefs } from "@/lib/types";

export function useReaderResults({ sources, scopedSources, search, prefs, topic, loading }: {
  sources: SourceFeed[];
  scopedSources: SourceFeed[];
  search: string;
  prefs: UserPrefs | null;
  topic: Topic;
  loading: boolean;
}) {
  const visible = useMemo(() => filterSources(scopedSources, search), [scopedSources, search]);
  const totalCount = useMemo(() => sources.reduce((count, source) => count + source.articles.length, 0), [sources]);
  const matchCount = useMemo(() => countMatches(scopedSources, search), [scopedSources, search]);
  const matchSourceCount = useMemo(() => visible.filter((source) => source.articles.length > 0).length, [visible]);
  const failedSources = useMemo(() => sources.filter((source) => Boolean(source.error)), [sources]);

  const configuredSourceCount = prefs
    ? visibleSourceIds(prefs.sourceOrder, new Set(prefs.hiddenSources), topic).length
    : 0;
  const loadedSourceCount = sources.length - failedSources.length;
  const statusText = `${loadedSourceCount} of ${configuredSourceCount} sources loaded · ${totalCount} ${totalCount === 1 ? "story" : "stories"}${failedSources.length ? ` · ${failedSources.length} failed` : ""}`;

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
    if (search.trim()) {
      return "No sources match this search. Try different keywords or clear.";
    }
    if (!loading && sources.length === 0) {
      return "No sources loaded yet. Try Refresh.";
    }
    return undefined;
  }, [prefs, topic, search, loading, sources.length]);

  return {
    visible, totalCount, matchCount, matchSourceCount, failedSources,
    configuredSourceCount, statusText, emptyMessage,
  };
}
