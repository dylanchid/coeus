"use client";

import { defaultRangeExtractor, useWindowVirtualizer, type Range } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ArchiveCollection, ArchiveData, ArchiveItem, ArchiveState } from "@/lib/archive";
import { itemToMarkdown } from "@/lib/archive/archiveExport";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { PostPublishPanel, type PublishedPost } from "./PostPublishPanel";
import type { ArchiveFilter, ArchiveSort } from "./useArchiveFilters";

const FILTERS: ArchiveFilter[] = ["all", "unread", "starred", "annotated"];
// Cards vary in height (notes, tags, summaries), so this is only the first
// guess; each mounted row is measured and the real height replaces it.
const ESTIMATED_ROW_HEIGHT = 230;
const OVERSCAN_ROWS = 4;

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
  const [postPanelItemId, setPostPanelItemId] = useState<string | null>(null);
  const [openDetails, setOpenDetails] = useState<Record<string, { note: boolean; organize: boolean }>>({});
  const itemPositions = useMemo(
    () => new Map(data.items.map((item, index) => [item.id, index + 1])),
    [data.items],
  );
  const listRef = useRef<HTMLOListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // The list scrolls with the document, so rows are positioned relative to the
  // list's own offset from the top of the page (controls and notices sit above).
  // Runs after every render on purpose: the offset shifts when notices appear.
  // The functional update bails out once the value is stable, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const top = listRef.current ? listRef.current.getBoundingClientRect().top + window.scrollY : 0;
    setScrollMargin((current) => (Math.abs(current - top) < 1 ? current : top));
  });
  // Rows holding the focused control or the open publish panel stay mounted even
  // when scrolled away, so an unsaved note draft or panel state is never dropped.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = new Set(defaultRangeExtractor(range));
    for (const id of [focusedItemId, postPanelItemId]) {
      const index = id ? visible.findIndex((item) => item.id === id) : -1;
      if (index >= 0) indexes.add(index);
    }
    return [...indexes].sort((a, b) => a - b);
  }, [visible, focusedItemId, postPanelItemId]);
  const virtualizer = useWindowVirtualizer({
    count: visible.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
    getItemKey: (index) => visible[index]?.id ?? index,
    rangeExtractor,
  });
  const setDetailOpen = useCallback((itemId: string, detail: "note" | "organize", open: boolean) => {
    setOpenDetails((current) => {
      const previous = current[itemId] ?? { note: false, organize: false };
      if (previous[detail] === open) return current;
      return { ...current, [itemId]: { ...previous, [detail]: open } };
    });
  }, []);
  return <section className="archive-main" aria-label="Saved pieces">
    {shareNotice ? <p className="archive-notice" role="status">{shareNotice}</p> : null}
    <div className="archive-controls"><div className="archive-search"><label htmlFor="archive-search">Search this view</label><span aria-hidden="true">⌕</span><input id="archive-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titles, notes, tags, authors…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear archive search">×</button> : null}</div><div className="archive-filters" role="group" aria-label="Filter archive">{FILTERS.map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}><span>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</span><small>{counts[value]}</small></button>)}</div></div>
    <div className="archive-result-meta"><span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}{query ? ` matching “${query}”` : ""}</span><label htmlFor="archive-sort">Sort <select id="archive-sort" value={sort} onChange={(event) => setSort(event.target.value as ArchiveSort)}><option value="newest">Newest saved</option><option value="oldest">Oldest saved</option><option value="title">Title A–Z</option></select></label></div>
    {visible.length ? <ol
      ref={listRef}
      className="archive-list"
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
      onFocus={(event) => setFocusedItemId(event.target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId ?? null)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusedItemId(null); }}
    >{virtualizer.getVirtualItems().map((row) => {
      const item = visible[row.index];
      if (!item) return null;
      return <ArchiveListItem key={item.id} item={item} measureRef={virtualizer.measureElement} rowIndex={row.index} rowCount={visible.length} rowStart={row.start - virtualizer.options.scrollMargin} itemPosition={itemPositions.get(item.id) ?? 0} collections={data.collections} patchItem={patchItem} recoveryBusy={recoveryBusy} captureContent={captureContent} onNotice={onNotice} showPostPanels={showPostPanels} postPanelItemId={postPanelItemId} setPostPanelItemId={setPostPanelItemId} post={postsByItem.get(item.id) ?? null} noteOpen={openDetails[item.id]?.note ?? false} organizeOpen={openDetails[item.id]?.organize ?? false} onDetailToggle={(detail, open) => setDetailOpen(item.id, detail, open)} />;
    })}</ol> : <div className="archive-empty"><span aria-hidden="true">◇</span><p>No pieces found.</p><small>Try a broader search, another filter, or save something from the reader.</small>{query || filter !== "all" ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</button> : null}</div>}
  </section>;
}

function ArchiveListItem({ item, measureRef, rowIndex, rowCount, rowStart, itemPosition, collections, patchItem, recoveryBusy, captureContent, onNotice, showPostPanels, postPanelItemId, setPostPanelItemId, post, noteOpen, organizeOpen, onDetailToggle }: {
  item: ArchiveItem;
  measureRef: (element: HTMLElement | null) => void;
  rowIndex: number;
  rowCount: number;
  rowStart: number;
  itemPosition: number;
  collections: ArchiveCollection[];
  patchItem: (id: string, patch: Partial<ArchiveItem>) => void;
  recoveryBusy: boolean;
  captureContent: (itemId: string) => Promise<void>;
  onNotice: (message: string) => void;
  showPostPanels: boolean;
  postPanelItemId: string | null;
  setPostPanelItemId: (itemId: string | null) => void;
  post: PublishedPost | null;
  noteOpen: boolean;
  organizeOpen: boolean;
  onDetailToggle: (detail: "note" | "organize", open: boolean) => void;
}) {
  return <li ref={measureRef} data-index={rowIndex} data-item-id={item.id} aria-setsize={rowCount} aria-posinset={rowIndex + 1} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${rowStart}px)` }} className={`archive-item is-${item.state}`}><div className="archive-item-index" aria-hidden="true"><span>{String(itemPosition).padStart(2, "0")}</span>{item.state === "unread" ? <i /> : null}</div><article><header className="archive-item-header"><div className="archive-item-meta"><span className="archive-source">{item.sourceName}</span><span>{item.topic}</span><span>Saved {relativeDate(item.savedAt)}</span></div><button className="archive-star" type="button" aria-label={item.starred ? `Unstar ${item.title}` : `Star ${item.title}`} aria-pressed={item.starred} onClick={() => patchItem(item.id, { starred: !item.starred })}><span aria-hidden="true">{item.starred ? "★" : "☆"}</span></button></header><h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<span className="archive-external" aria-hidden="true">↗</span><ExternalLinkHint /></a></h2>{item.summary ? <p className="archive-summary">{item.summary}</p> : null}{item.note ? <blockquote><span>Your note</span>{item.note}</blockquote> : null}{item.tags.length ? <div className="archive-tags" aria-label="Tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}<div className="archive-item-actions"><label className="archive-state"><span className="visually-hidden">Reading state for {item.title}</span><i className={`archive-state-dot is-${item.state}`} aria-hidden="true" /><select value={item.state} onChange={(event) => patchItem(item.id, { state: event.target.value as ArchiveState })}><option value="unread">Unread</option><option value="read">Read</option><option value="kept">Kept</option></select></label><details className="archive-note-editor" open={noteOpen} onToggle={(event) => onDetailToggle("note", event.currentTarget.open)}><summary>{item.note ? "Edit note" : "Add a note"}</summary><label><span>Why this matters</span><textarea key={item.note} defaultValue={item.note} placeholder="Capture the idea, connection, or question you want to return to…" onBlur={(event) => patchItem(item.id, { note: event.target.value.trim() })} /></label></details><details className="archive-item-tools" open={organizeOpen} onToggle={(event) => onDetailToggle("organize", event.currentTarget.open)}><summary>Organize</summary><div><label><span>Collection</span><select aria-label={`Collection for ${item.title}`} value={item.collectionIds[0] ?? ""} onChange={(event) => patchItem(item.id, { collectionIds: event.target.value ? [event.target.value] : [] })}><option value="">No collection</option>{organizeOpen ? collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>) : null}</select></label><button type="button" onClick={() => void navigator.clipboard.writeText(itemToMarkdown(item)).then(() => onNotice("Markdown clip copied"))}>Copy Markdown</button><button type="button" disabled={recoveryBusy} onClick={() => void captureContent(item.id)}>Capture private copy</button></div></details>{showPostPanels ? postPanelItemId === item.id ? <PostPublishPanel key={item.id} itemLocalId={item.id} initialPost={post} /> : <button type="button" onClick={() => setPostPanelItemId(item.id)}>{post ? "Edit published post" : "Publish as post"}</button> : null}</div></article></li>;
}
