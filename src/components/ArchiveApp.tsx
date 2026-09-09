"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { useAuth } from "./AuthProvider";
import { ProfileGate } from "./ProfileGate";
import { AppShell } from "./AppShell";
import type { ArchiveRevisionSummary, ContentSnapshotSummary } from "@/lib/archiveRecovery";
import { parseArchiveSyncSnapshot } from "@/lib/archiveSync";
import { ExternalLinkHint } from "./ExternalLinkHint";
import { DestinationsPanel } from "./DestinationsPanel";
import { VisibilitySelect } from "./VisibilitySelect";
import { PostPublishPanel, type PublishedPost } from "./PostPublishPanel";
import { ArchivePublishPanel } from "./ArchivePublishPanel";
import { useArchiveFilters, type ArchiveFilter, type ArchiveSort } from "./useArchiveFilters";
import { usePublications } from "./usePublications";

const FILTERS: ArchiveFilter[] = ["all", "unread", "starred", "annotated"];

function relativeDate(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function ArchiveApp() {
  const { archive: data, updateArchive, sync, retrySync, replaceArchiveFromServer } = useArchive();
  const auth = useAuth();
  const [collectionId, setCollectionId] = useState("all");
  const [newCollection, setNewCollection] = useState("");
  const [newCollectionKind, setNewCollectionKind] = useState<CollectionKind>("personal");
  const [newCollectionVisibility, setNewCollectionVisibility] = useState<CollectionVisibility>("private");
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [revisions, setRevisions] = useState<ArchiveRevisionSummary[]>([]);
  const [contentSnapshots, setContentSnapshots] = useState<ContentSnapshotSummary[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  // itemLocalId -> the post published for it, so each row's PostPublishPanel
  // opens in the right state. Fetched once; the panels manage their own writes.
  const [postsByItem, setPostsByItem] = useState<ReadonlyMap<string, PublishedPost>>(new Map());

  const update = (recipe: (current: ArchiveData) => ArchiveData) => {
    updateArchive(recipe);
  };

  const requestJson = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Request failed (${response.status})`);
    }
    return response;
  };
  const { publications, publishBusy, publishCollection, unpublishCollection } = usePublications(requestJson, setShareNotice);

  const selectedCollection = data?.collections.find((collection) => collection.id === collectionId);
  const currentPublication = selectedCollection
    ? publications.find((publication) => publication.collectionLocalId === selectedCollection.id && !publication.unpublishedAt)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/posts", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { posts: { itemLocalId: string; visibility: PublishedPost["visibility"]; commentary: string }[] };
        if (!cancelled) {
          setPostsByItem(new Map(body.posts.map((post) => [post.itemLocalId, { visibility: post.visibility, commentary: post.commentary }])));
        }
      } catch {
        // Not signed in, or posts are unavailable; each panel stays in its unpublished default.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { query, setQuery, filter, setFilter, sort, setSort, collectionItems, counts, visible } = useArchiveFilters(data?.items ?? [], collectionId);

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
    download(archiveToMarkdown(exportItems, selectedCollection), `coeus-${selectedCollection?.id ?? "archive"}.md`, "text/markdown;charset=utf-8");
    setShareNotice("Markdown exported for Obsidian or Notion");
  };

  const exportCsv = () => {
    if (!data) return;
    download(archiveToCsv(exportItems, data.collections), `coeus-${selectedCollection?.id ?? "archive"}.csv`, "text/csv;charset=utf-8");
    setShareNotice("CSV exported for Notion");
  };

  const refreshRecovery = async () => {
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/revisions");
      const body = await response.json() as { revisions: ArchiveRevisionSummary[] };
      setRevisions(body.revisions);
      const exportResponse = await requestJson("/api/archive/export");
      const exported = await exportResponse.json() as { contentSnapshots: ContentSnapshotSummary[] };
      setContentSnapshots(exported.contentSnapshots);
      setShareNotice("Recovery history refreshed");
    } catch (error) { setShareNotice(error instanceof Error ? error.message : "Recovery history is unavailable"); }
    finally { setRecoveryBusy(false); }
  };

  const exportArchiveJson = async () => {
    try {
      const response = await requestJson("/api/archive/export");
      download(await response.text(), "coeus-archive.json", "application/json;charset=utf-8");
      setShareNotice("Lossless archive export downloaded");
    } catch (error) { setShareNotice(error instanceof Error ? error.message : "Archive export failed"); }
  };

  const captureContent = async (itemId: string) => {
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
      const captured = await response.json() as ContentSnapshotSummary;
      setContentSnapshots((current) => [captured, ...current.filter((snapshot) => snapshot.id !== captured.id)]);
      setShareNotice("Private reading snapshot captured");
    } catch (error) { setShareNotice(error instanceof Error ? error.message : "Content capture failed"); }
    finally { setRecoveryBusy(false); }
  };

  const restoreRevision = async (revision: number) => {
    if (!window.confirm(`Restore revision ${revision}? This creates a new recovery revision; existing history remains.`)) return;
    setRecoveryBusy(true);
    try {
      const response = await requestJson("/api/archive/revisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision }) });
      const body = await response.json() as { archiveId: string; snapshot: unknown };
      const parsed = parseArchiveSyncSnapshot(body.snapshot);
      if (!parsed.ok) throw new Error("The recovered archive is invalid");
      await replaceArchiveFromServer(body.archiveId, parsed.value);
      setShareNotice(`Restored revision ${revision}; a new immutable revision was created`);
      await refreshRecovery();
    } catch (error) { setShareNotice(error instanceof Error ? error.message : "Archive recovery failed"); }
    finally { setRecoveryBusy(false); }
  };

  const signOut = async () => {
    try { await auth.signOut(); setShareNotice("Signed out. This device's labeled local archive remains here."); }
    catch (error) { setShareNotice(error instanceof Error ? error.message : "Sign out failed"); }
  };

  const deleteAccount = async () => {
    if (window.prompt('Type DELETE to permanently delete your cloud archive and account. This does not erase the labeled local copy on this device.') !== "DELETE") return;
    setRecoveryBusy(true);
    try { await requestJson("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" }) }); setShareNotice("Cloud account and private snapshots deleted. The local device copy was kept."); }
    catch (error) { setShareNotice(error instanceof Error ? error.message : "Account deletion failed"); }
    finally { setRecoveryBusy(false); }
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
        <ProfileGate />
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
                <VisibilitySelect id="collection-visibility" value={newCollectionVisibility} onChange={setNewCollectionVisibility} />
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
                <button type="button" onClick={() => void exportArchiveJson()}>Full JSON archive <span aria-hidden="true">↓</span></button>
              </div>
            </details>
            {selectedCollection && selectedCollection.id !== "inbox" ? (
              <ArchivePublishPanel
                key={selectedCollection.id}
                collectionId={selectedCollection.id}
                publication={currentPublication}
                busy={publishBusy}
                onPublish={(visibility, curatorNote, attribution) => void publishCollection(selectedCollection.id, visibility, curatorNote, attribution)}
                onUnpublish={() => void unpublishCollection(selectedCollection.id)}
              />
            ) : null}
            <details className="archive-portability">
              <summary>Sync, recovery &amp; account</summary>
              <div className="archive-sidebar-actions" aria-label="Archive sync and recovery">
                <p className="archive-sync-state" role="status">Sync: {sync.status}{sync.pending ? ` · ${sync.pending} queued` : ""}{sync.conflicts ? ` · ${sync.conflicts} conflicts retained` : ""}</p>
                {sync.message && sync.status !== "synced" ? <p className="archive-sync-state" role="status">{sync.message}</p> : null}
                {sync.recoveredCorruptQueue ? <p className="archive-sync-state" role="alert">A damaged offline queue was set aside for recovery; export your archive if recent edits are missing.</p> : null}
                {sync.paused ? <button type="button" onClick={() => retrySync()}>Retry sync now</button> : null}
                <button type="button" disabled={recoveryBusy} onClick={() => void refreshRecovery()}>Refresh recovery history</button>
                {revisions.map((revision) => <button key={revision.revision} type="button" disabled={recoveryBusy} onClick={() => void restoreRevision(revision.revision)}>Restore revision {revision.revision}</button>)}
                {contentSnapshots.length ? <div className="archive-snapshot-list">{contentSnapshots.map((snapshot) => <a key={snapshot.id} href={`/api/archive/snapshots/${snapshot.id}`}>Captured {snapshot.itemId} · {snapshot.status}</a>)}</div> : null}
                {auth.status === "signed-out" ? (
                  <>
                    <p className="archive-account-state" role="status">Not signed in — this archive stays on this device.</p>
                    <Link href="/signin?next=/archive">Sign in to sync ↗</Link>
                  </>
                ) : auth.status === "loading" ? (
                  <p className="archive-account-state" role="status">Checking sign-in…</p>
                ) : (
                  <>
                    <p className="archive-account-state" role="status">
                      {auth.profile ? <>Signed in as <strong>@{auth.profile.handle}</strong></> : "Signed in"}
                      {auth.user?.email ? ` · ${auth.user.email}` : ""}
                    </p>
                    {auth.profile ? <Link href="/welcome?next=/archive">Edit profile</Link> : <Link href="/welcome?next=/archive">Finish setting up your profile ↗</Link>}
                    <button type="button" onClick={() => void signOut()}>Sign out — keep local copy</button>
                    <button type="button" className="archive-danger" disabled={recoveryBusy} onClick={() => void deleteAccount()}>Delete cloud account…</button>
                  </>
                )}
              </div>
            </details>
            <DestinationsPanel onNotice={setShareNotice} />
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
              <label htmlFor="archive-sort">Sort <select id="archive-sort" value={sort} onChange={(event) => setSort(event.target.value as ArchiveSort)}><option value="newest">Newest saved</option><option value="oldest">Oldest saved</option><option value="title">Title A–Z</option></select></label>
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
                      <h2><a href={item.url} target="_blank" rel="noreferrer">{item.title}<span className="archive-external" aria-hidden="true">↗</span><ExternalLinkHint /></a></h2>
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
                            <button type="button" disabled={recoveryBusy} onClick={() => void captureContent(item.id)}>Capture private copy</button>
                          </div>
                        </details>
                        {auth.status !== "signed-out" ? (
                          <PostPublishPanel key={item.id} itemLocalId={item.id} initialPost={postsByItem.get(item.id) ?? null} />
                        ) : null}
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
