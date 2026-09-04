"use client";

import { useMemo, useState } from "react";
import {
  type ArchiveCollection,
  type ArchiveData,
  type ArchiveItem,
  type ArchiveState,
  type CollectionKind,
  type CollectionVisibility,
} from "@/lib/archive";
import { archiveToCsv, archiveToMarkdown, itemToMarkdown } from "@/lib/archiveExport";
import { useArchive } from "./AppProviders";
import { AppShell } from "./AppShell";

type Filter = "all" | "unread" | "starred" | "annotated";
type Sort = "newest" | "oldest" | "title";

const FILTERS: Filter[] = ["all", "unread", "starred", "annotated"];

function relativeDate(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function matches(item: ArchiveItem, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [
    item.title,
    item.summary,
    item.sourceName,
    item.author,
    item.topic,
    item.note,
    ...item.tags,
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function ArchiveApp() {
  const { archive: data, updateArchive } = useArchive();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [collectionId, setCollectionId] = useState("all");
  const [newCollection, setNewCollection] = useState("");
  const [newCollectionKind, setNewCollectionKind] = useState<CollectionKind>("personal");
  const [newCollectionVisibility, setNewCollectionVisibility] = useState<CollectionVisibility>("private");
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  const update = (recipe: (current: ArchiveData) => ArchiveData) => {
    updateArchive(recipe);
  };

  const selectedCollection = data?.collections.find((collection) => collection.id === collectionId);
  const collectionItems = useMemo(() => {
    const items = data?.items ?? [];
    return collectionId === "all"
      ? items
      : items.filter((item) => item.collectionIds.includes(collectionId));
  }, [data, collectionId]);

  const counts = useMemo(() => ({
    all: collectionItems.length,
    unread: collectionItems.filter((item) => item.state === "unread").length,
    starred: collectionItems.filter((item) => item.starred).length,
    annotated: collectionItems.filter((item) => item.note.trim()).length,
  }), [collectionItems]);

  const visible = useMemo(() => {
    const filtered = collectionItems.filter((item) => {
      if (filter === "unread" && item.state !== "unread") return false;
      if (filter === "starred" && !item.starred) return false;
      if (filter === "annotated" && !item.note.trim()) return false;
      return matches(item, query);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const newestFirst = Date.parse(b.savedAt) - Date.parse(a.savedAt);
      return sort === "oldest" ? -newestFirst : newestFirst;
    });
  }, [collectionItems, filter, query, sort]);

  const patchItem = (id: string, patch: Partial<ArchiveItem>) => {
    update((current) => ({
      ...current,
      items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    }));
  };

  const createCollection = () => {
    const name = newCollection.trim();
    if (!name) return;
    const collection: ArchiveCollection = {
      id: `collection-${Date.now()}`,
      name,
      description: "A new path through your archive.",
      visibility: newCollectionVisibility,
      kind: newCollectionKind,
      createdAt: new Date().toISOString(),
    };
    update((current) => ({ ...current, collections: [...current.collections, collection] }));
    setCollectionId(collection.id);
    setNewCollection("");
    setNewCollectionKind("personal");
    setNewCollectionVisibility("private");
    setComposerOpen(false);
  };

  const download = (contents: string, filename: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportItems = selectedCollection
    ? data?.items.filter((item) => item.collectionIds.includes(selectedCollection.id)) ?? []
    : data?.items ?? [];

  const exportMarkdown = () => {
    download(archiveToMarkdown(exportItems, selectedCollection), `bareaga-${selectedCollection?.id ?? "archive"}.md`, "text/markdown;charset=utf-8");
    setShareNotice("Markdown exported for Obsidian or Notion");
  };

  const exportCsv = () => {
    if (!data) return;
    download(archiveToCsv(exportItems, data.collections), `bareaga-${selectedCollection?.id ?? "archive"}.csv`, "text/csv;charset=utf-8");
    setShareNotice("CSV exported for Notion");
  };

  const shareCollection = async () => {
    if (!selectedCollection) return;
    const text = `Bareaga collection: ${selectedCollection.name}`;
    try {
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      setShareNotice("Collection link copied");
    } catch {
      setShareNotice("Ready to share when this archive is synced");
    }
    window.setTimeout(() => setShareNotice(""), 2600);
  };

  if (!data) return <p className="boot">Opening your archive…</p>;

  const namedCollections = data.collections.filter((collection) => collection.id !== "inbox");
  const inbox = data.collections.find((collection) => collection.id === "inbox");
  const itemCountIn = (id: string) => data.items.filter((item) => item.collectionIds.includes(id)).length;

  return (
    <AppShell
      section="archive"
      footerNote={
        <>
          <strong>Private by default.</strong> Your archive lives on this device
          today; shared collections are the next layer.
        </>
      }
    >
      <div className="archive-page">
        <section className="archive-overview" aria-labelledby="archive-title">
          <div className="archive-overview-copy">
            <p className="archive-eyebrow">
              {selectedCollection
                ? `${selectedCollection.kind} collection · ${selectedCollection.visibility}`
                : "Personal library"}
            </p>
            <h1 id="archive-title">{selectedCollection?.name ?? "Everything worth returning to."}</h1>
            <p>
              {selectedCollection?.description
                ?? "Your saved reading, kept with the notes and context that made it matter."}
            </p>
          </div>
          <dl className="archive-overview-stats" aria-label="Archive summary">
            <div><dt>Saved</dt><dd>{collectionItems.length}</dd></div>
            <div><dt>Unread</dt><dd>{counts.unread}</dd></div>
            <div><dt>With notes</dt><dd>{counts.annotated}</dd></div>
          </dl>
        </section>

        <div className="archive-workspace">
          <aside className="archive-sidebar" aria-label="Archive collections">
            <div className="archive-sidebar-head">
              <span>Browse library</span>
              <span>{data.items.length} saved</span>
            </div>
            <nav className="archive-collection-nav" aria-label="Library views">
              <button className={collectionId === "all" ? "is-active" : ""} aria-current={collectionId === "all" ? "page" : undefined} onClick={() => setCollectionId("all")}>
                <span><i aria-hidden="true">⌂</i>Everything</span><small>{data.items.length}</small>
              </button>
              {inbox ? (
                <button className={collectionId === inbox.id ? "is-active" : ""} aria-current={collectionId === inbox.id ? "page" : undefined} onClick={() => setCollectionId(inbox.id)}>
                  <span><i aria-hidden="true">↓</i>{inbox.name}</span><small>{itemCountIn(inbox.id)}</small>
                </button>
              ) : null}
            </nav>
            <div className="archive-collection-label"><span>Collections</span><span>{namedCollections.length}</span></div>
            <nav className="archive-collection-nav" aria-label="Collections">
              {namedCollections.map((collection) => (
                <button key={collection.id} className={collectionId === collection.id ? "is-active" : ""} aria-current={collectionId === collection.id ? "page" : undefined} onClick={() => setCollectionId(collection.id)}>
                  <span><i aria-hidden="true">{collection.kind === "community" ? "◎" : "◇"}</i>{collection.name}</span>
                  <small>{itemCountIn(collection.id)}</small>
                </button>
              ))}
            </nav>
            {composerOpen ? (
              <form className="collection-composer" onSubmit={(event) => { event.preventDefault(); createCollection(); }}>
                <label htmlFor="new-collection">Collection name</label>
                <input id="new-collection" autoFocus value={newCollection} onChange={(event) => setNewCollection(event.target.value)} placeholder="e.g. Local futures" />
                <label htmlFor="collection-kind">Ownership</label>
                <select id="collection-kind" value={newCollectionKind} onChange={(event) => setNewCollectionKind(event.target.value as CollectionKind)}><option value="personal">Personal</option><option value="community">Community</option></select>
                <label htmlFor="collection-visibility">Visibility</label>
                <select id="collection-visibility" value={newCollectionVisibility} onChange={(event) => setNewCollectionVisibility(event.target.value as CollectionVisibility)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select>
                <div><button type="submit">Create</button><button type="button" onClick={() => setComposerOpen(false)}>Cancel</button></div>
              </form>
            ) : (
              <button className="new-collection-button" onClick={() => setComposerOpen(true)}><span aria-hidden="true">＋</span> New collection</button>
            )}
            <details className="archive-portability">
              <summary>Export &amp; share</summary>
              <div className="archive-sidebar-actions" aria-label="Archive portability">
                <button type="button" onClick={exportMarkdown}>Markdown <span aria-hidden="true">↓</span></button>
                <button type="button" onClick={exportCsv}>Notion CSV <span aria-hidden="true">↓</span></button>
                {selectedCollection && selectedCollection.id !== "inbox" ? (
                  <button type="button" onClick={() => void shareCollection()}>Copy collection link <span aria-hidden="true">↗</span></button>
                ) : null}
              </div>
            </details>
          </aside>

          <section className="archive-main" aria-label="Saved pieces">
            {shareNotice ? <p className="archive-notice" role="status">{shareNotice}</p> : null}

            <div className="archive-controls">
              <div className="archive-search">
                <label htmlFor="archive-search">Search this view</label>
                <span aria-hidden="true">⌕</span>
                <input id="archive-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titles, notes, tags, authors…" />
                {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear archive search">×</button> : null}
              </div>
              <div className="archive-filters" role="group" aria-label="Filter archive">
                {FILTERS.map((value) => (
                  <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    <span>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</span>
                    <small>{counts[value]}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="archive-result-meta">
              <span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}{query ? ` matching “${query}”` : ""}</span>
              <label htmlFor="archive-sort">Sort <select id="archive-sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="newest">Newest saved</option><option value="oldest">Oldest saved</option><option value="title">Title A–Z</option></select></label>
            </div>

            {visible.length ? (
              <ol className="archive-list">
                {visible.map((item) => (
                  <li key={item.id} className={`archive-item is-${item.state}`}>
                    <div className="archive-item-index" aria-hidden="true">
                      <span>{String(data.items.indexOf(item) + 1).padStart(2, "0")}</span>
                      {item.state === "unread" ? <i /> : null}
                    </div>
                    <article>
                      <header className="archive-item-header">
                        <div className="archive-item-meta">
                          <span className="archive-source">{item.sourceName}</span><span>{item.topic}</span><span>Saved {relativeDate(item.savedAt)}</span>
                        </div>
                        <button className="archive-star" type="button" aria-label={item.starred ? `Unstar ${item.title}` : `Star ${item.title}`} aria-pressed={item.starred} onClick={() => patchItem(item.id, { starred: !item.starred })}><span aria-hidden="true">{item.starred ? "★" : "☆"}</span></button>
                      </header>
                      <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<span className="archive-external" aria-hidden="true">↗</span></a></h2>
                      {item.summary ? <p className="archive-summary">{item.summary}</p> : null}
                      {item.note ? <blockquote><span>Your note</span>{item.note}</blockquote> : null}
                      {item.tags.length ? <div className="archive-tags" aria-label="Tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
                      <div className="archive-item-actions">
                        <label className="archive-state">
                          <span className="visually-hidden">Reading state for {item.title}</span>
                          <i className={`archive-state-dot is-${item.state}`} aria-hidden="true" />
                          <select value={item.state} onChange={(event) => patchItem(item.id, { state: event.target.value as ArchiveState })}>
                            <option value="unread">Unread</option><option value="read">Read</option><option value="kept">Kept</option>
                          </select>
                        </label>
                        <details className="archive-note-editor">
                          <summary>{item.note ? "Edit note" : "Add a note"}</summary>
                          <label>
                            <span>Why this matters</span>
                            <textarea
                              key={item.note}
                              defaultValue={item.note}
                              placeholder="Capture the idea, connection, or question you want to return to…"
                              onBlur={(event) => patchItem(item.id, { note: event.target.value.trim() })}
                            />
                          </label>
                        </details>
                        <details className="archive-item-tools">
                          <summary>Organize</summary>
                          <div>
                            <label>
                              <span>Collection</span>
                              <select aria-label={`Collection for ${item.title}`} value={item.collectionIds[0] ?? ""} onChange={(event) => patchItem(item.id, { collectionIds: event.target.value ? [event.target.value] : [] })}>
                                <option value="">No collection</option>
                                {data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                              </select>
                            </label>
                            <button type="button" onClick={() => void navigator.clipboard.writeText(itemToMarkdown(item)).then(() => setShareNotice("Markdown clip copied"))}>Copy Markdown</button>
                          </div>
                        </details>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="archive-empty">
                <span aria-hidden="true">◇</span>
                <p>No pieces found.</p>
                <small>Try a broader search, another filter, or save something from the reader.</small>
                {query || filter !== "all" ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear search and filters</button> : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
