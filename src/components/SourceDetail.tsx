"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Article, SourceDef } from "@/lib/types";
import type { CollectionPublicationSummary } from "@/lib/collectionPublication";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useArchive } from "./AppProviders";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { SourceRatingsPanel } from "./SourceRatingsPanel";

type Props = {
  source: SourceDef;
  isAdded: boolean;
  rating: number;
  onToggle: () => void;
  onRate: (rating: number) => void;
  onClose: () => void;
};

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function engagementScore(article: Article): number {
  return (article.engagement?.points ?? 0) + (article.engagement?.comments ?? 0);
}

/** Popular first when the feed carries engagement signals; otherwise the feed's own newest-first order. */
function rankArticles(articles: Article[]): { ranked: Article[]; byEngagement: boolean } {
  const byEngagement = articles.some((article) => engagementScore(article) > 0);
  if (!byEngagement) return { ranked: articles.slice(0, 8), byEngagement };
  return { ranked: [...articles].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, 8), byEngagement };
}

/**
 * A source page in the reader-preview's frame: story list on the left, the
 * source's facts and your own relationship to it on the right. Everything here
 * is real data — live feed items, the reader's archive, and public collections.
 * There is no community rating or review store, so none is implied.
 */
export function SourceDetail({ source, isAdded, rating, onToggle, onRate, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalDialog({ active: true, containerRef: dialogRef, initialFocusRef: closeRef, onClose });
  const { archive } = useArchive();
  const [articles, setArticles] = useState<Load<Article[]>>({ status: "loading" });
  const [collections, setCollections] = useState<Load<CollectionPublicationSummary[]>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const get = async <T,>(url: string, pick: (body: unknown) => T): Promise<Load<T>> => {
      try {
        const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) return { status: "error" };
        return { status: "ready", data: pick(await response.json()) };
      } catch {
        return { status: "error" };
      }
    };
    void get(`/api/feeds?ids=${encodeURIComponent(source.id)}&limit=30&hours=168`, (body) => {
      const feed = (body as { sources?: { articles?: Article[]; error?: string }[] }).sources?.[0];
      if (!feed || feed.error) throw new Error("feed");
      return feed.articles ?? [];
    }).then((result) => !controller.signal.aborted && setArticles(result));
    void get(`/api/sources/collections?name=${encodeURIComponent(source.name)}&limit=5`, (body) => (body as { collections?: CollectionPublicationSummary[] }).collections ?? [])
      .then((result) => !controller.signal.aborted && setCollections(result));
    return () => controller.abort();
  }, [source.id, source.name]);

  const history = useMemo(() => {
    const items = (archive?.items ?? []).filter((item) => item.sourceName === source.name);
    const ids = new Set(items.map((item) => item.id));
    return {
      items: [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
      read: items.filter((item) => item.state === "read").length,
      starred: items.filter((item) => item.starred).length,
      yourCollections: (archive?.collections ?? []).filter((collection) =>
        items.some((item) => ids.has(item.id) && item.collectionIds.includes(collection.id))
      ),
    };
  }, [archive, source.name]);

  const ranked = articles.status === "ready" ? rankArticles(articles.data) : null;

  return (
    <div className="article-preview-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="article-preview source-detail" role="dialog" aria-modal="true" aria-labelledby="source-detail-title" tabIndex={-1}>
        <header className="article-preview-bar">
          <span className="article-preview-address" title={source.homeUrl}>{hostOf(source.homeUrl)}</span>
          <div>
            <a href={source.homeUrl} target="_blank" rel="noreferrer">Visit site ↗<ExternalLinkHint /></a>
            <button type="button" ref={closeRef} onClick={onClose} aria-label="Close source page">×</button>
          </div>
        </header>
        <div className="article-preview-layout">
          <div className="source-detail-main">
            <section aria-labelledby="source-detail-popular">
              <h3 id="source-detail-popular">{ranked?.byEngagement ? "Popular articles" : "Latest articles"}</h3>
              {articles.status === "loading" ? <p className="source-detail-note">Loading stories from {source.name}…</p> : null}
              {articles.status === "error" ? <p className="source-detail-note">This feed could not be read right now.</p> : null}
              {ranked && !ranked.ranked.length ? <p className="source-detail-note">No recent stories in this feed.</p> : null}
              {ranked?.ranked.length ? (
                <>
                  {!ranked.byEngagement ? <p className="source-detail-note">This feed publishes no popularity signal, so stories are shown newest first.</p> : null}
                  <ol className="source-detail-articles">
                    {ranked.ranked.map((article) => (
                      <li key={article.id}>
                        <a href={article.url} target="_blank" rel="noreferrer">{article.title}<ExternalLinkHint /></a>
                        <span>
                          {[
                            article.engagement?.points ? `${article.engagement.points} points` : "",
                            article.engagement?.comments ? `${article.engagement.comments} comments` : "",
                            article.author,
                            formatDate(article.publishedAt) || article.ageLabel,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </section>

            <section aria-labelledby="source-detail-collections">
              <h3 id="source-detail-collections">Seen in collections</h3>
              {collections.status === "loading" ? <p className="source-detail-note">Looking for public collections…</p> : null}
              {collections.status === "error" ? <p className="source-detail-note">Public collections are unavailable right now.</p> : null}
              {collections.status === "ready" && !collections.data.length ? <p className="source-detail-note">No public collection includes this source yet.</p> : null}
              {collections.status === "ready" && collections.data.length ? (
                <ul className="source-detail-collections">
                  {collections.data.map((collection) => (
                    <li key={collection.id}>
                      <a href={`/c/${collection.slug}`}>{collection.name}</a>
                      <span>{collection.itemCount} {collection.itemCount === 1 ? "item" : "items"}{collection.attribution ? ` · ${collection.attribution}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="source-detail-history">
              <h3 id="source-detail-history">Your history</h3>
              {!archive ? <p className="source-detail-note">Opening your archive…</p> : null}
              {archive && !history.items.length ? <p className="source-detail-note">You have not saved anything from {source.name} yet.</p> : null}
              {history.items.length ? (
                <>
                  <p className="source-detail-note">
                    {history.items.length} saved · {history.read} read · {history.starred} starred
                    {history.yourCollections.length ? ` · in ${history.yourCollections.map((collection) => collection.name).join(", ")}` : ""}
                  </p>
                  <ol className="source-detail-articles">
                    {history.items.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLinkHint /></a>
                        <span>Saved {formatDate(item.savedAt)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </section>
          </div>

          <aside className="article-preview-details">
            <p className="article-preview-kicker">Source</p>
            <h2 id="source-detail-title">{source.name}</h2>
            <p>{source.description}</p>
            <dl>
              <div><dt>Site</dt><dd><a href={source.homeUrl} target="_blank" rel="noreferrer">{hostOf(source.homeUrl)} ↗</a></dd></div>
              <div><dt>Type</dt><dd>{source.sourceType.replace("-", " ")}</dd></div>
              <div><dt>Region</dt><dd>{source.region} · {source.language}</dd></div>
              <div><dt>Updates</dt><dd>{source.cadence} · {source.depth}</dd></div>
              <div><dt>Topics</dt><dd>{source.topics.join(", ")}</dd></div>
              {source.tags.length ? <div><dt>Labels</dt><dd>{source.tags.map((tag) => `#${tag}`).join(" ")}</dd></div> : null}
              <div><dt>Feed</dt><dd><a href={source.feedUrl} target="_blank" rel="noreferrer">{hostOf(source.feedUrl)} ↗</a></dd></div>
            </dl>
            <SourceRatingsPanel sourceId={source.id} sourceName={source.name} rating={rating} onRate={onRate} />
            <div className="article-preview-actions">
              <button type="button" onClick={onToggle}>{isAdded ? "Added to your reader ✓ — remove" : "+ Add to your reader"}</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
