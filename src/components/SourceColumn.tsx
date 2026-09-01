"use client";

import { memo, useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatEngagement } from "@/lib/engagement";
import type { Article, SourceFeed } from "@/lib/types";

type Props = {
  source: SourceFeed;
  highlightQuery: string;
  showSummaries: boolean;
  showAuthors: boolean;
  showAges: boolean;
  showEngagement: boolean;
  onRetry?: (sourceId: string) => Promise<void> | void;
  savedArticleIds: Set<string>;
  onSave: (article: Article, sourceName: string, topic: string) => void;
  onShare: (article: Article, sourceName: string, topic: string) => void;
};

function EngagementChip({
  engagement,
}: {
  engagement: NonNullable<SourceFeed["articles"][number]["engagement"]>;
}) {
  const label = formatEngagement(engagement);
  if (!label) return null;
  const href = engagement.discussionUrl;
  if (href) {
    return (
      <a
        className="engagement"
        href={href}
        target="_blank"
        rel="noreferrer"
        title="Discussion"
      >
        {" "}
        {label}
      </a>
    );
  }
  return <span className="engagement"> {label}</span>;
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = text.split(re);
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));
  return parts.map((part, i) =>
    tokenSet.has(part.toLowerCase()) ? (
      <mark key={i}>{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function SourceColumnInner({
  source,
  highlightQuery,
  showSummaries,
  showAuthors,
  showAges,
  showEngagement,
  onRetry,
  savedArticleIds,
  onSave,
  onShare,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.55 : 1,
    }),
    [transform, transition, isDragging]
  );

  const q = highlightQuery.trim();

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await onRetry(source.id);
    } catch {
      setRetryError("Retry failed. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`source-col${isDragging ? " dragging" : ""}`}
      data-source={source.id}
    >
      <header className="source-head">
        <button
          type="button"
          className="drag-handle"
          title="Drag to reorder"
          aria-label={`Reorder ${source.name}`}
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <h3>
          {source.homeUrl ? (
            <a href={source.homeUrl} target="_blank" rel="noreferrer">
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </h3>
      </header>

      {source.error ? (
        <p className="source-error">
          Couldn’t load feed: {source.error}
          {onRetry ? (
            <>
              {" "}
              <button
                type="button"
                className="source-retry"
                onClick={() => void handleRetry()}
                disabled={retrying}
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {retryError ? (
        <p className="source-error" role="alert">
          {retryError}
        </p>
      ) : null}

      {!source.error && source.articles.length === 0 ? (
        <p className="source-empty">No matching articles.</p>
      ) : null}

      <ul>
        {source.articles.map((a) => (
          <li key={a.id}>
            <a href={a.url} target="_blank" rel="noreferrer">
              {q ? highlight(a.title, q) : a.title}
            </a>
            {showAges && a.ageLabel ? (
              <span className="age"> [{a.ageLabel}]</span>
            ) : null}
            {showAuthors && a.author ? (
              <span className="author"> — {a.author}</span>
            ) : null}
            {showEngagement && a.engagement ? (
              <EngagementChip engagement={a.engagement} />
            ) : null}
            <button
              type="button"
              className="story-save"
              aria-pressed={savedArticleIds.has(a.id)}
              onClick={() => onSave(a, source.name, source.topic)}
              disabled={savedArticleIds.has(a.id)}
            >
              {savedArticleIds.has(a.id) ? "saved" : "+ save"}
            </button>
            <button type="button" className="story-save" onClick={() => onShare(a, source.name, source.topic)}>share ↗</button>
            {showSummaries && a.summary ? (
              <p className="summary">
                {q ? highlight(a.summary, q) : a.summary}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const SourceColumn = memo(SourceColumnInner);
