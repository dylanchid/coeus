import type { SourceFeed } from "@/lib/types";

export function ReaderFeedback({
  statusText, loading, refreshing, activeCategories, clearCategories,
  search, matchCount, matchSourceCount, error, refresh, failedSources,
}: {
  statusText: string;
  loading: boolean;
  refreshing: boolean;
  activeCategories: string[];
  clearCategories: () => void;
  search: string;
  matchCount: number;
  matchSourceCount: number;
  error: string | null;
  refresh: () => void;
  failedSources: SourceFeed[];
}) {
  return <>
    <p className="feed-status" role="status" aria-live="polite" aria-atomic="true">
      <span>{statusText}</span>
      {loading || refreshing ? <span className="status-working">Loading next batch…</span> : null}
      {activeCategories.length ? (
        <span>Filtered to {activeCategories.join(", ")} · <button type="button" onClick={clearCategories}>clear</button></span>
      ) : null}
      {search.trim() ? <span>{matchCount} shown across {matchSourceCount} sources</span> : null}
    </p>
    {error ? (
      <p className="banner-error" role="alert">
        {error} <button type="button" onClick={refresh}>Try again</button>
      </p>
    ) : null}
    {failedSources.length > 0 ? (
      <p className="banner-warn" role="status">
        Some publishers could not be reached: {failedSources
          .map((source) => `${source.name} (${source.error})`)
          .join("; ")}. Other stories are still available.
      </p>
    ) : null}
  </>;
}
