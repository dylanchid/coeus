import type { Topic } from "@/lib/feeds/sources";
import type { Article, SourceFeed, UserPrefs } from "@/lib/types";
import { SourceGrid } from "./SourceGrid";
import { StoryFeed } from "./StoryFeed";
import { UiButton } from "./ui/Button";

export function ReaderContent({
  prefs, topic, loading, sources, visible, search, matchCount, emptyMessage,
  configuredSourceCount, clearSearch, openSources, refresh, onReorder,
  onRetry, savedArticleIds, onSave, onShare, onOpen,
}: {
  prefs: UserPrefs;
  topic: Topic;
  loading: boolean;
  sources: SourceFeed[];
  visible: SourceFeed[];
  search: string;
  matchCount: number;
  emptyMessage?: string;
  configuredSourceCount: number;
  clearSearch: () => void;
  openSources: () => void;
  refresh: () => void;
  onReorder: (ids: string[]) => void;
  onRetry: (id: string) => Promise<void> | void;
  savedArticleIds: Set<string>;
  onSave: (article: Article, sourceName: string, topic: string) => void;
  onShare: (article: Article, sourceName: string, topic: string) => void;
  onOpen: (article: Article, sourceName: string, homeUrl: string | undefined, topic: string) => void;
}) {
  if (loading && sources.length === 0) {
    return <div className="feed-loading" role="status" aria-live="polite">
      <p>Loading {topic === "all" ? "the latest" : topic} stories…</p>
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </div>;
  }
  if (visible.length === 0 || (search.trim() && matchCount === 0)) {
    return <div className="reader-empty">
      <p>{emptyMessage ?? "No stories are available for this selection."}</p>
      {search.trim() ? (
        <UiButton onClick={clearSearch}>Clear search</UiButton>
      ) : prefs.sourceOrder.every((id) => prefs.hiddenSources.includes(id)) ||
          (topic !== "all" && configuredSourceCount === 0) ? (
        <UiButton onClick={openSources}>Manage sources</UiButton>
      ) : (
        <UiButton onClick={refresh}>Refresh sources</UiButton>
      )}
    </div>;
  }
  if (prefs.homeView === "grid") {
    return <SourceGrid
      sources={visible}
      highlightQuery={search}
      emptyMessage={emptyMessage}
      showSummaries={prefs.showSummaries}
      showAuthors={prefs.showAuthors}
      showAges={prefs.showAges}
      showEngagement={prefs.showEngagement}
      onReorder={onReorder}
      onRetry={onRetry}
      savedArticleIds={savedArticleIds}
      onSave={onSave}
      onShare={onShare}
      onOpen={onOpen}
    />;
  }
  return <StoryFeed
    sources={visible}
    view={prefs.homeView}
    representation={prefs.storyRepresentation}
    highlightQuery={search}
    keywordRules={prefs.keywordRules}
    sourceWeights={prefs.sourceWeights}
    emptyMessage={emptyMessage}
    savedArticleIds={savedArticleIds}
    onSave={onSave}
    onShare={onShare}
    onOpen={onOpen}
  />;
}
