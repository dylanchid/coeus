"use client";

import { memo, useMemo } from "react";
import { formatEngagement } from "@/lib/engagement";
import { rankStories, type RankingReason } from "@/lib/ranking";
import type {
  Article,
  HomeViewId,
  KeywordRule,
  SourceFeed,
  StoryRepresentationId,
} from "@/lib/types";
import { ExternalLinkHint } from "./ExternalLinkHint";

type Story = {
  key: string;
  article: Article;
  sourceId: string;
  sourceName: string;
  sourceTopic: string;
  sourceHomeUrl?: string;
  sourceIndex: number;
  articleIndex: number;
  score?: number;
  reasons?: RankingReason[];
  matchedTerms?: string[];
};

type Props = {
  sources: SourceFeed[];
  view: Exclude<HomeViewId, "grid">;
  representation: StoryRepresentationId;
  highlightQuery: string;
  keywordRules: KeywordRule[];
  sourceWeights: Record<string, number>;
  emptyMessage?: string;
  savedArticleIds: Set<string>;
  onSave: (article: Article, sourceName: string, topic: string) => void;
  onShare: (article: Article, sourceName: string, topic: string) => void;
  onOpen: (article: Article, sourceName: string, sourceHomeUrl: string | undefined, sourceTopic: string) => void;
};

function storyTime(story: Story): number {
  if (!story.article.publishedAt) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(story.article.publishedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function compareRecent(a: Story, b: Story): number {
  return (
    storyTime(b) - storyTime(a) ||
    a.sourceIndex - b.sourceIndex ||
    a.articleIndex - b.articleIndex ||
    a.key.localeCompare(b.key)
  );
}

function flatten(sources: SourceFeed[]): Story[] {
  return sources.flatMap((source, sourceIndex) =>
    source.error
      ? []
      : source.articles.map((article, articleIndex) => ({
          key: `${source.id}:${article.id}`,
          article,
          sourceId: source.id,
          sourceName: source.name,
          sourceTopic: source.topic,
          sourceHomeUrl: source.homeUrl,
          sourceIndex,
          articleIndex,
        }))
  );
}

/** Strict global recency ordering used by Focus. */
export function sortStoriesByRecency(sources: SourceFeed[]): Story[] {
  return flatten(sources).sort(compareRecent);
}

/**
 * Top is deliberately score-free: rotate categories, then sources within each
 * category, while taking each source's newest remaining story.
 */
export function balanceStories(sources: SourceFeed[]): Story[] {
  const stories = flatten(sources);
  const topics = [...new Set(stories.map((story) => story.sourceTopic))].sort();
  const queues = new Map<string, Story[]>();
  const sourcesByTopic = new Map<string, string[]>();

  for (const story of stories) {
    const queue = queues.get(story.sourceId) ?? [];
    queue.push(story);
    queues.set(story.sourceId, queue);
    const ids = sourcesByTopic.get(story.sourceTopic) ?? [];
    if (!ids.includes(story.sourceId)) ids.push(story.sourceId);
    sourcesByTopic.set(story.sourceTopic, ids);
  }
  for (const queue of queues.values()) queue.sort(compareRecent);

  const sourceCursor = new Map(topics.map((topic) => [topic, 0]));
  const result: Story[] = [];
  while (result.length < stories.length) {
    let added = false;
    for (const topic of topics) {
      const ids = sourcesByTopic.get(topic) ?? [];
      if (!ids.length) continue;
      const start = sourceCursor.get(topic) ?? 0;
      for (let offset = 0; offset < ids.length; offset += 1) {
        const index = (start + offset) % ids.length;
        const queue = queues.get(ids[index]!)!;
        const story = queue.shift();
        if (!story) continue;
        result.push(story);
        sourceCursor.set(topic, (index + 1) % ids.length);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return result;
}

function highlight(text: string, terms: string[]) {
  const tokens = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!tokens.length) return text;
  const re = new RegExp(`(${tokens.join("|")})`, "gi");
  return text.split(re).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index}>{part}</mark>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

function StoryFeedInner({
  sources,
  view,
  representation,
  highlightQuery,
  keywordRules,
  sourceWeights,
  emptyMessage,
  savedArticleIds,
  onSave,
  onShare,
  onOpen,
}: Props) {
  const stories = useMemo(
    () =>
      view === "focus"
        ? sortStoriesByRecency(sources)
        : view === "ranked"
          ? rankStories(sources, keywordRules, sourceWeights)
          : balanceStories(sources),
    [sources, view, keywordRules, sourceWeights]
  );
  const detailed = representation === "detailed";

  if (!stories.length) {
    return (
      <p className="empty-grid">
        {emptyMessage ?? "No stories are available for this selection."}
      </p>
    );
  }

  return (
    <section className={`story-feed is-${representation}`} aria-label={`${view === "top" ? "Top" : view === "focus" ? "Focus" : "Ranked"} stories`}>
      <p className="story-method">
        {view === "top"
          ? "Balanced Top: recent stories rotate across categories, then sources. No popularity score or hidden ranking."
          : view === "focus"
            ? "Focus: every story is ordered by published time, newest first."
            : "Ranked: keyword relevance, source preference, recency, normalized engagement, and diversity. Every point is shown below."}
      </p>
      <ol className="story-list">
        {stories.map((story) => {
          const engagement = story.article.engagement
            ? formatEngagement(story.article.engagement)
            : null;
          const highlightTerms = [
            ...highlightQuery.trim().split(/\s+/).filter(Boolean),
            ...(story.matchedTerms ?? []),
          ];
          return (
            <li key={story.key} className="story-item">
              <div className="story-meta">
                {story.sourceHomeUrl ? (
                  <a href={story.sourceHomeUrl} target="_blank" rel="noreferrer">
                    {story.sourceName}<ExternalLinkHint />
                  </a>
                ) : (
                  <span>{story.sourceName}</span>
                )}
                <span aria-hidden="true"> · </span>
                <span>{story.sourceTopic}</span>
                {story.article.ageLabel ? (
                  <><span aria-hidden="true"> · </span><span>{story.article.ageLabel}</span></>
                ) : null}
                {detailed && story.article.author ? (
                  <><span aria-hidden="true"> · </span><span>{story.article.author}</span></>
                ) : null}
                {detailed && engagement ? (
                  <><span aria-hidden="true"> · </span><span>{engagement}</span></>
                ) : null}
                {view === "ranked" ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <strong className="story-score">Score {story.score ?? 0}</strong>
                    <details className="story-rank-details">
                      <summary>Why this score</summary>
                      <span>{(story.reasons ?? []).map((reason, index) => (
                        <span key={`${reason.label}:${index}`}>
                          {index ? <span aria-hidden="true"> · </span> : null}
                          {reason.label} {reason.points > 0 ? "+" : ""}{reason.points}
                        </span>
                      ))}</span>
                    </details>
                  </>
                ) : null}
              </div>
              <h2 className="story-title">
                <a href={story.article.url} target="_blank" rel="noreferrer" onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  onOpen(story.article, story.sourceName, story.sourceHomeUrl, story.sourceTopic);
                }}>
                  {highlight(story.article.title, highlightTerms)}<ExternalLinkHint />
                </a>
              </h2>
              {detailed && story.article.summary ? (
                <p className="story-summary">
                  {highlight(story.article.summary, highlightTerms)}
                </p>
              ) : null}
              <details className="story-actions">
                <summary>Actions</summary>
                <span>
                  <button
                    type="button"
                    className="story-save"
                    aria-pressed={savedArticleIds.has(story.article.id)}
                    onClick={() => onSave(story.article, story.sourceName, story.sourceTopic)}
                    disabled={savedArticleIds.has(story.article.id)}
                  >
                    {savedArticleIds.has(story.article.id) ? "saved to archive" : "+ save to archive"}
                  </button>
                  <button type="button" className="story-save" onClick={() => onShare(story.article, story.sourceName, story.sourceTopic)}>share ↗</button>
                </span>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const StoryFeed = memo(StoryFeedInner);
