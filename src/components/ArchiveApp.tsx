"use client";

import Link from "next/link";
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
import { PrimaryNav } from "./PrimaryNav";

type Filter = "all" | "unread" | "starred" | "annotated";

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
  const visible = useMemo(() => {
    if (!data) return [];
    return data.items.filter((item) => {
      if (collectionId !== "all" && !item.collectionIds.includes(collectionId)) return false;
      if (filter === "unread" && item.state !== "unread") return false;
      if (filter === "starred" && !item.starred) return false;
      if (filter === "annotated" && !item.note.trim()) return false;
      return matches(item, query);
    });
  }, [data, collectionId, filter, query]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      unread: items.filter((item) => item.state === "unread").length,
      starred: items.filter((item) => item.starred).length,
      annotated: items.filter((item) => item.note.trim()).length,
    };
  }, [data]);

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

  return (
    <div className="archive-page">
      <header className="archive-header">
        <div>
          <Link className="archive-wordmark" href="/">Bareaga</Link>
          <span className="archive-section-name">/ archive</span>
        </div>
        <PrimaryNav current="archive" />
      </header>

      <section className="archive-intro">
        <p className="archive-kicker">A place for the web worth keeping</p>
        <div>
          <h1>Save is only<br />the beginning.</h1>
          <p>
            Read later, remember why it mattered, connect it to other ideas, then
            keep it private or share a path for others to follow.
          </p>
        </div>
      </section>

      <div className="archive-workspace">
        <aside className="archive-sidebar" aria-label="Archive collections">
          <div className="archive-sidebar-head">
            <span>Library</span>
            <span>{data.items.length} items</span>
          </div>
          <button className={collectionId === "all" ? "is-active" : ""} onClick={() => setCollectionId("all")}>
            <span>Everything</span><small>{data.items.length}</small>
          </button>
          <div className="archive-collection-label">Collections</div>
          {data.collections.map((collection) => (
            <button key={collection.id} className={collectionId === collection.id ? "is-active" : ""} onClick={() => setCollectionId(collection.id)}>
              <span>{collection.kind === "community" ? "◎ " : ""}{collection.name}</span>
              <small>{data.items.filter((item) => item.collectionIds.includes(collection.id)).length}</small>
            </button>
          ))}
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
            <button className="new-collection-button" onClick={() => setComposerOpen(true)}>+ New collection</button>
          )}
        </aside>

        <section className="archive-main">
          <div className="archive-context">
            <div>
              <p>{selectedCollection ? `Collection · ${selectedCollection.visibility}` : "Your complete archive"}</p>
              <h2>{selectedCollection?.name ?? "Everything"}</h2>
              <span>{selectedCollection?.description ?? "Every saved article, note, and connection in one searchable place."}</span>
            </div>
            {selectedCollection && selectedCollection.id !== "inbox" ? (
              <button onClick={() => void shareCollection()}>Share collection ↗</button>
            ) : null}
          </div>
          {shareNotice ? <p className="archive-notice" role="status">{shareNotice}</p> : null}

          <section className="archive-integrations" aria-label="Archive portability">
            <div><p>Open by design</p><strong>Keep using the archive you already trust.</strong><span>Markdown preserves links, notes, tags, and frontmatter for Obsidian. CSV maps cleanly into a Notion database.</span></div>
            <div><button type="button" onClick={exportMarkdown}>Export Markdown</button><button type="button" onClick={exportCsv}>Export Notion CSV</button></div>
          </section>

          <div className="archive-controls">
            <label>
              <span>Search archive</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, notes, tags, people…" />
            </label>
            <div className="archive-filters" role="group" aria-label="Filter archive">
              {(["all", "unread", "starred", "annotated"] as const).map((value) => (
                <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
                  {value !== "all" ? ` ${counts[value]}` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="archive-result-meta"><span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}</span><span>Newest saves first</span></div>
          {visible.length ? (
            <ol className="archive-list">
              {visible.map((item) => (
                <li key={item.id} className={`archive-item is-${item.state}`}>
                  <div className="archive-item-index" aria-hidden="true">{String(data.items.indexOf(item) + 1).padStart(2, "0")}</div>
                  <article>
                    <div className="archive-item-meta">
                      <span>{item.sourceName}</span><span>·</span><span>{item.topic}</span><span>·</span><span>saved {relativeDate(item.savedAt)}</span>
                    </div>
                    <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
                    {item.summary ? <p className="archive-summary">{item.summary}</p> : null}
                    {item.note ? <blockquote>{item.note}</blockquote> : null}
                    {item.tags.length ? <div className="archive-tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
                    <div className="archive-item-actions">
                      <select aria-label={`Reading state for ${item.title}`} value={item.state} onChange={(event) => patchItem(item.id, { state: event.target.value as ArchiveState })}>
                        <option value="unread">Unread</option><option value="read">Read</option><option value="kept">Keep</option>
                      </select>
                      <button aria-pressed={item.starred} onClick={() => patchItem(item.id, { starred: !item.starred })}>{item.starred ? "★ Starred" : "☆ Star"}</button>
                      <button onClick={() => void navigator.clipboard.writeText(itemToMarkdown(item)).then(() => setShareNotice("Markdown clip copied"))}>Copy Markdown</button>
                      <select aria-label={`Collection for ${item.title}`} value={item.collectionIds[0] ?? ""} onChange={(event) => patchItem(item.id, { collectionIds: event.target.value ? [event.target.value] : [] })}>
                        <option value="">No collection</option>
                        {data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                      </select>
                    </div>
                    <details className="archive-note-editor">
                      <summary>{item.note ? "Edit note" : "+ Add why this matters"}</summary>
                      <label>
                        <span>Private note</span>
                        <textarea
                          key={item.note}
                          defaultValue={item.note}
                          placeholder="Capture the idea, connection, or question you want to return to…"
                          onBlur={(event) => patchItem(item.id, { note: event.target.value.trim() })}
                        />
                      </label>
                    </details>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className="archive-empty"><p>No pieces found.</p><span>Try a broader search, another filter, or save something from the reader.</span></div>
          )}
        </section>
      </div>

      <footer className="archive-footer">
        <p><strong>Private by default.</strong> Your archive lives on this device today. Shared collections are the next layer.</p>
        <p>Collect deliberately. Preserve context. Build paths, not piles.</p>
      </footer>
    </div>
  );
}
