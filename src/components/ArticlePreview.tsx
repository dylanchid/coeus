"use client";

import { useEffect, useRef, useState } from "react";
import type { Article, EmbedCompatibility } from "@/lib/types";
import { inferArticleIndex, type ArticleIndex } from "@/lib/articleIndex";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  article: Article;
  sourceName: string;
  sourceHomeUrl?: string;
  sourceTopic?: string;
  onClose: () => void;
  onOpenOriginal: () => void;
  onPreferExternal: () => void;
  compatibility?: EmbedCompatibility;
};

function articleHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "publisher site";
  }
}

/**
 * A deliberately lightweight in-site reading layer. Publishers may prohibit
 * framing; the original-link control remains the reliable reading path.
 */
export function ArticlePreview({ article, sourceName, sourceHomeUrl, sourceTopic, onClose, onOpenOriginal, onPreferExternal, compatibility = "unknown" }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalDialog({ active: true, containerRef: dialogRef, initialFocusRef: closeRef, onClose });
  const host = articleHost(article.url);

  return (
    <div className="article-preview-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="article-preview" role="dialog" aria-modal="true" aria-labelledby="article-preview-title" tabIndex={-1}>
        <header className="article-preview-bar">
          <span className="article-preview-address" title={article.url}>{host}</span>
          <div>
            <a href={article.url} target="_blank" rel="noreferrer">Open original ↗</a>
            <button type="button" ref={closeRef} onClick={onClose} aria-label="Close preview">×</button>
          </div>
        </header>
        <div className="article-preview-layout">
          <div className="article-preview-frame-wrap">
            {compatibility !== "allowed" ? (
              <StaticSourcePreview key={article.url} article={article} sourceTopic={sourceTopic} />
            ) : (
              <>
                <iframe
                  className="article-preview-frame"
                  src={article.url}
                  title={`Preview of ${article.title}`}
                  sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
                  referrerPolicy="no-referrer"
                />
                <p className="article-preview-frame-note">If this publisher blocks previews, Coeus can show a static source preview when the publisher permits it.</p>
              </>
            )}
          </div>
          <aside className="article-preview-details">
            <p className="article-preview-kicker">Reader preview</p>
            <h2 id="article-preview-title">{article.title}</h2>
            {article.summary ? <p>{article.summary}</p> : null}
            <dl>
              <div><dt>Source</dt><dd>{sourceHomeUrl ? <a href={sourceHomeUrl} target="_blank" rel="noreferrer">{sourceName} ↗</a> : sourceName}</dd></div>
              {article.author ? <div><dt>By</dt><dd>{article.author}</dd></div> : null}
              {article.publishedAt ? <div><dt>Published</dt><dd>{new Date(article.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</dd></div> : null}
            </dl>
            <ArticleIndexPanel index={inferArticleIndex({ title: article.title, description: article.summary, sourceTopic })} />
            <div className="article-preview-actions">
              <button type="button" onClick={onOpenOriginal}>Read at {host} ↗</button>
              <button type="button" className="article-preview-text-button" onClick={onPreferExternal}>Always open originals</button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

type PreviewCard = {
  title: string;
  description: string;
  siteName: string;
  domain: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  index: ArticleIndex;
};

type ReaderViewData = {
  title: string;
  byline: string;
  excerpt: string;
  contentHtml: string;
  wordCount: number;
  leadImage: string | null;
  truncated: boolean;
  index: ArticleIndex;
};

const EMPTY_INDEX: ArticleIndex = { publisherTags: [], topics: [], keywords: [] };

function normaliseIndex(value: unknown): ArticleIndex {
  if (!value || typeof value !== "object") return EMPTY_INDEX;
  const raw = value as Record<string, unknown>;
  const strings = (field: string) => Array.isArray(raw[field]) ? raw[field].filter((item): item is string => typeof item === "string") : [];
  return { publisherTags: strings("publisherTags"), topics: strings("topics"), keywords: strings("keywords") };
}

type CardState =
  | { status: "loading" }
  | { status: "reader"; reader: ReaderViewData }
  | { status: "ready"; card: PreviewCard }
  | { status: "unavailable" };

async function loadReader(url: string): Promise<ReaderViewData | null> {
  try {
    const response = await fetch(`/api/article-preview/reader?url=${encodeURIComponent(url)}`, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as { reader?: ReaderViewData };
    return data.reader ? { ...data.reader, index: normaliseIndex(data.reader.index) } : null;
  } catch {
    return null;
  }
}

async function loadCard(url: string): Promise<PreviewCard | null> {
  try {
    const response = await fetch(`/api/article-preview/card?url=${encodeURIComponent(url)}`, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    const data = (await response.json()) as { card?: PreviewCard };
    return data.card ? { ...data.card, index: normaliseIndex(data.card.index) } : null;
  } catch {
    return null;
  }
}

/**
 * The fallback shown when a publisher blocks framing. SPIKE (bareaga_web-0bs.3):
 * try a server-extracted, sanitised reader view first; fall back to the
 * OpenGraph metadata card; then to a plain "open the original" message.
 */
function StaticSourcePreview({ article, sourceTopic }: { article: Article; sourceTopic?: string }) {
  const [state, setState] = useState<CardState>({ status: "loading" });
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const reader = await loadReader(article.url);
      if (cancelled) return;
      if (reader) { setState({ status: "reader", reader }); return; }
      const card = await loadCard(article.url);
      if (cancelled) return;
      setState(card ? { status: "ready", card } : { status: "unavailable" });
    })();
    return () => { cancelled = true; };
  }, [article.url]);

  const host = articleHost(article.url);

  if (state.status === "loading") {
    return (
      <div className="article-preview-static is-loading">
        <div className="article-preview-static-label">Source preview</div>
        <p>Loading a preview from {host}…</p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <figure className="article-preview-static article-preview-static-unavailable">
        <div className="article-preview-static-label">Source preview</div>
        <figcaption>Preview unavailable or disallowed by this publisher. Open the original article to read it.</figcaption>
      </figure>
    );
  }

  if (state.status === "reader") {
    const { reader } = state;
    return (
      <div className="article-preview-static article-preview-reader">
        <div className="article-preview-static-label">Reader view</div>
        <article>
          <p className="article-preview-reader-source">{host}</p>
          <h3>{reader.title || article.title}</h3>
          {reader.byline ? <p className="article-preview-reader-byline">{reader.byline}</p> : null}
          {/* contentHtml is sanitised server-side (sanitize-html allowlist, https-only,
              images already routed through the same-origin proxy) before it reaches here. */}
          <div className="article-preview-reader-body" dangerouslySetInnerHTML={{ __html: reader.contentHtml }} />
          <ArticleIndexPanel index={mergeIndex(reader.index, sourceTopic)} />
          <p className="article-preview-reader-more">
            {reader.truncated ? "Excerpt shown. " : ""}
            <a href={article.url} target="_blank" rel="noreferrer">Read the full article at {host} ↗</a>
          </p>
        </article>
      </div>
    );
  }

  const { card } = state;
  return (
    <figure className="article-preview-static article-preview-card">
      <div className="article-preview-static-label">Source preview</div>
      {card.imageUrl && !heroBroken ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy route (/api/article-preview/image), not a remote source image.
        <img
          className="article-preview-card-image"
          src={card.imageUrl}
          alt=""
          onError={() => setHeroBroken(true)}
        />
      ) : null}
      <figcaption className="article-preview-card-body">
        <span className="article-preview-card-site">
          {card.faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin proxy route.
            <img src={card.faviconUrl} alt="" width={16} height={16} onError={(event) => { event.currentTarget.hidden = true; }} />
          ) : null}
          {card.siteName || card.domain || host}
        </span>
        <span className="article-preview-card-title">{card.title || article.title}</span>
        {card.description ? <span className="article-preview-card-desc">{card.description}</span> : null}
        <ArticleIndexPanel index={mergeIndex(card.index, sourceTopic)} compact />
      </figcaption>
    </figure>
  );
}

function mergeIndex(index: ArticleIndex, sourceTopic?: string): ArticleIndex {
  if (!sourceTopic || sourceTopic === "all" || index.topics.includes(sourceTopic.toLocaleLowerCase())) return index;
  return { ...index, topics: [sourceTopic.toLocaleLowerCase(), ...index.topics].slice(0, 3) };
}

function ArticleIndexPanel({ index, compact = false }: { index: ArticleIndex; compact?: boolean }) {
  const hasSignals = index.publisherTags.length || index.topics.length || index.keywords.length;
  if (!hasSignals) return null;
  return (
    <section className={`article-preview-index${compact ? " is-compact" : ""}`} aria-label="Article indexing signals">
      <p>Index signals <span>Local suggestions</span></p>
      {index.publisherTags.length ? <div><b>Publisher labels</b><span>{index.publisherTags.map((tag) => <em key={tag}>#{tag}</em>)}</span></div> : null}
      {index.topics.length ? <div><b>Topics</b><span>{index.topics.map((topic) => <em key={topic}>#{topic}</em>)}</span></div> : null}
      {index.keywords.length ? <div><b>Key terms</b><span>{index.keywords.map((keyword) => <em key={keyword}>#{keyword}</em>)}</span></div> : null}
    </section>
  );
}

type ChoiceProps = Omit<Props, "onPreferExternal" | "onOpenOriginal"> & {
  onChoosePreview: () => void;
  onChooseExternal: () => void;
};

/** First-use preference prompt: no surprise interception for habitual RSS readers. */
export function ArticlePreviewChoice({ article, sourceName, onClose, onChoosePreview, onChooseExternal }: ChoiceProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  useModalDialog({ active: true, containerRef: dialogRef, initialFocusRef: previewRef, onClose });

  return (
    <div className="article-preview-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="article-preview-choice" role="dialog" aria-modal="true" aria-labelledby="article-preview-choice-title" tabIndex={-1}>
        <p className="article-preview-kicker">Choose how Reader opens stories</p>
        <h2 id="article-preview-choice-title">Preview “{article.title}” in Coeus?</h2>
        <p>Preview keeps the article, source details, and a link to {sourceName} together. Some publishers do not allow embedded previews.</p>
        <div>
          <button ref={previewRef} type="button" onClick={onChoosePreview}>Preview in Coeus</button>
          <button type="button" onClick={onChooseExternal}>Always open original ↗</button>
        </div>
        <button type="button" className="article-preview-text-button" onClick={onClose}>Not now</button>
      </section>
    </div>
  );
}
