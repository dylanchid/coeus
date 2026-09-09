"use client";

import type { ArchiveCollection, ArchiveData, ArchiveItem, ArchiveState } from "@/lib/archive";
import { itemToMarkdown } from "@/lib/archiveExport";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { PostPublishPanel, type PublishedPost } from "./PostPublishPanel";
import type { ArchiveFilter, ArchiveSort } from "./useArchiveFilters";

const FILTERS: ArchiveFilter[] = ["all", "unread", "starred", "annotated"];

function relativeDate(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Search controls and saved-piece cards; mutations are injected by ArchiveApp. */
export function ArchiveList({ data, query, setQuery, filter, setFilter, sort, setSort, counts, visible, patchItem, recoveryBusy, captureContent, onNotice, shareNotice, showPostPanels, postsByItem }: {
  data: ArchiveData;
  query: string;
  setQuery: (value: string) => void;
  filter: ArchiveFilter;
  setFilter: (value: ArchiveFilter) => void;
  sort: ArchiveSort;
  setSort: (value: ArchiveSort) => void;
  counts: Record<ArchiveFilter, number>;
  visible: ArchiveItem[];
  patchItem: (id: string, patch: Partial<ArchiveItem>) => void;
  recoveryBusy: boolean;
  captureContent: (itemId: string) => Promise<void>;
  onNotice: (message: string) => void;
  shareNotice: string;
  showPostPanels: boolean;
  postsByItem: ReadonlyMap<string, PublishedPost>;
}) {
  return <section className="archive-main" aria-label="Saved pieces">
    {shareNotice ? <p className="archive-notice" role="status">{shareNotice}</p> : null}
    <div className="archive-controls"><div className="archive-search"><label htmlFor="archive-search">Search this view</label><span aria-hidden="true">⌕</span><input id="archive-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titles, notes, tags, authors…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear archive search">×</button> : null}</div><div className="archive-filters" role="group" aria-label="Filter archive">{FILTERS.map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}><span>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</span><small>{counts[value]}</small></button>)}</div></div>
    <div className="archive-result-meta"><span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}{query ? ` matching “${query}”` : ""}</span><label htmlFor="archive-sort">Sort <select id="archive-sort" value={sort} onChange={(event) => setSort(event.target.value as ArchiveSort)}><option value="newest">Newest saved</option><option value="oldest">Oldest saved</option><option value="title">Title A–Z</option></select></label></div>
    {visible.length ? <ol className="archive-list">{visible.map((item) => <li key={item.id} className={`archive-item is-${item.state}`}><div className="archive-item-index" aria-hidden="true"><span>{String(data.items.indexOf(item) + 1).padStart(2, "0")}</span>{item.state === "unread" ? <i /> : null}</div><article><header className="archive-item-header"><div className="archive-item-meta"><span className="archive-source">{item.sourceName}</span><span>{item.topic}</span><span>Saved {relativeDate(item.savedAt)}</span></div><button className="archive-star" type="button" aria-label={item.starred ? `Unstar ${item.title}` : `Star ${item.title}`} aria-pressed={item.starred} onClick={() => patchItem(item.id, { starred: !item.starred })}><span aria-hidden="true">{item.starred ? "★" : "☆"}</span></button></header><h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<span className="archive-external" aria-hidden="true">↗</span><ExternalLinkHint /></a></h2>{item.summary ? <p className="archive-summary">{item.summary}</p> : null}{item.note ? <blockquote><span>Your note</span>{item.note}</blockquote> : null}{item.tags.length ? <div className="archive-tags" aria-label="Tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}<div className="archive-item-actions"><label className="archive-state"><span className="visually-hidden">Reading state for {item.title}</span><i className={`archive-state-dot is-${item.state}`} aria-hidden="true" /><select value={item.state} onChange={(event) => patchItem(item.id, { state: event.target.value as ArchiveState })}><option value="unread">Unread</option><option value="read">Read</option><option value="kept">Kept</option></select></label><details className="archive-note-editor"><summary>{item.note ? "Edit note" : "Add a note"}</summary><label><span>Why this matters</span><textarea key={item.note} defaultValue={item.note} placeholder="Capture the idea, connection, or question you want to return to…" onBlur={(event) => patchItem(item.id, { note: event.target.value.trim() })} /></label></details><details className="archive-item-tools"><summary>Organize</summary><div><label><span>Collection</span><select aria-label={`Collection for ${item.title}`} value={item.collectionIds[0] ?? ""} onChange={(event) => patchItem(item.id, { collectionIds: event.target.value ? [event.target.value] : [] })}><option value="">No collection</option>{data.collections.map((collection: ArchiveCollection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><button type="button" onClick={() => void navigator.clipboard.writeText(itemToMarkdown(item)).then(() => onNotice("Markdown clip copied"))}>Copy Markdown</button><button type="button" disabled={recoveryBusy} onClick={() => void captureContent(item.id)}>Capture private copy</button></div></details>{showPostPanels ? <PostPublishPanel key={item.id} itemLocalId={item.id} initialPost={postsByItem.get(item.id) ?? null} /> : null}</div></article></li>)}</ol> : <div className="archive-empty"><span aria-hidden="true">◇</span><p>No pieces found.</p><small>Try a broader search, another filter, or save something from the reader.</small>{query || filter !== "all" ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</button> : null}</div>}
  </section>;
}
