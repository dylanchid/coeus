"use client";

import { useRef } from "react";
import type { Article } from "@/lib/types";
import { useModalDialog } from "@/hooks/useModalDialog";

type Props = {
  article: Article;
  sourceName: string;
  sourceHomeUrl?: string;
  onClose: () => void;
  onOpenOriginal: () => void;
  onPreferExternal: () => void;
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
export function ArticlePreview({ article, sourceName, sourceHomeUrl, onClose, onOpenOriginal, onPreferExternal }: Props) {
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
            <iframe
              className="article-preview-frame"
              src={article.url}
              title={`Preview of ${article.title}`}
              sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
              referrerPolicy="no-referrer"
            />
            <p className="article-preview-frame-note">If this publisher blocks previews, open the original article.</p>
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
