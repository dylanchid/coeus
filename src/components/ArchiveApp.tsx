"use client";

import { useEffect, useState } from "react";
import type { ArchiveCollection, ArchiveData, ArchiveItem, CollectionKind, CollectionVisibility } from "@/lib/archive";
import { archiveToCsv, archiveToMarkdown } from "@/lib/archive/archiveExport";
import { useArchive } from "./AppProviders";
import { useAuth } from "./AuthProvider";
import { ProfileGate } from "./ProfileGate";
import { AppShell } from "./AppShell";
import { ArchiveSidebar } from "./ArchiveSidebar";
import { ArchiveList } from "./ArchiveList";
import { type PublishedPost } from "./PostPublishPanel";
import { useArchiveFilters } from "./useArchiveFilters";
import { usePublications } from "./usePublications";
import { useArchiveRecovery } from "./useArchiveRecovery";

/** Archive workflows plus the page body, exported as a focused UI-test seam. */
export function ArchiveWorkspace() {
  const { archive: data, updateArchive, sync, retrySync, replaceArchiveFromServer } = useArchive();
  const auth = useAuth();
  const [collectionId, setCollectionId] = useState("all");
  const [newCollection, setNewCollection] = useState("");
  const [newCollectionKind, setNewCollectionKind] = useState<CollectionKind>("personal");
  const [newCollectionVisibility, setNewCollectionVisibility] = useState<CollectionVisibility>("private");
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [postsByItem, setPostsByItem] = useState<ReadonlyMap<string, PublishedPost>>(new Map());

  const update = (recipe: (current: ArchiveData) => ArchiveData) => { void updateArchive(recipe); };
  const requestJson = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Request failed (${response.status})`);
    }
    return response;
  };
  const { publications, publishBusy, publishCollection, unpublishCollection } = usePublications(requestJson, setShareNotice);
  const recovery = useArchiveRecovery({ requestJson, replaceArchiveFromServer, onNotice: setShareNotice });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/posts", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ posts: { itemLocalId: string; visibility: PublishedPost["visibility"]; commentary: string }[] }> : null)
      .then((body) => { if (!cancelled && body) setPostsByItem(new Map(body.posts.map((post) => [post.itemLocalId, { visibility: post.visibility, commentary: post.commentary }]))); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const filters = useArchiveFilters(data?.items ?? [], collectionId);
  const selectedCollection = data?.collections.find((collection) => collection.id === collectionId);
  const currentPublication = selectedCollection ? publications.find((publication) => publication.collectionLocalId === selectedCollection.id && !publication.unpublishedAt) : undefined;
  const patchItem = (id: string, patch: Partial<ArchiveItem>) => update((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const createCollection = () => {
    const name = newCollection.trim();
    if (!name) return;
    const collection: ArchiveCollection = { id: `collection-${Date.now()}`, name, description: "A new path through your archive.", visibility: newCollectionVisibility, kind: newCollectionKind, createdAt: new Date().toISOString() };
    update((current) => ({ ...current, collections: [...current.collections, collection] }));
    setCollectionId(collection.id); setNewCollection(""); setNewCollectionKind("personal"); setNewCollectionVisibility("private"); setComposerOpen(false);
  };
  const download = (contents: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  };
  const exportItems = selectedCollection ? data?.items.filter((item) => item.collectionIds.includes(selectedCollection.id)) ?? [] : data?.items ?? [];
  const exportMarkdown = () => { download(archiveToMarkdown(exportItems, selectedCollection), `coeus-${selectedCollection?.id ?? "archive"}.md`, "text/markdown;charset=utf-8"); setShareNotice("Markdown exported for Obsidian or Notion"); };
  const exportCsv = () => { if (data) { download(archiveToCsv(exportItems, data.collections), `coeus-${selectedCollection?.id ?? "archive"}.csv`, "text/csv;charset=utf-8"); setShareNotice("CSV exported for Notion"); } };
  const exportArchiveJson = async () => { try { const response = await requestJson("/api/archive/export"); download(await response.text(), "coeus-archive.json", "application/json;charset=utf-8"); setShareNotice("Lossless archive export downloaded"); } catch (error) { setShareNotice(error instanceof Error ? error.message : "Archive export failed"); } };
  const signOut = async () => { try { await auth.signOut(); setShareNotice("Signed out. This device's labeled local archive remains here."); } catch (error) { setShareNotice(error instanceof Error ? error.message : "Sign out failed"); } };
  const deleteAccount = async () => {
    if (window.prompt("Type DELETE to permanently delete your cloud archive and account. This does not erase the labeled local copy on this device.") !== "DELETE") return;
    setAccountBusy(true);
    try { await requestJson("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE" }) }); setShareNotice("Cloud account and private snapshots deleted. The local device copy was kept."); }
    catch (error) { setShareNotice(error instanceof Error ? error.message : "Account deletion failed"); } finally { setAccountBusy(false); }
  };

  if (!data) return <p className="boot">Opening your archive…</p>;
  return <div className="archive-page"><ProfileGate /><section className="archive-overview" aria-labelledby="archive-title"><div className="archive-overview-copy"><p className="archive-eyebrow">{selectedCollection ? `${selectedCollection.kind} collection · ${selectedCollection.visibility}` : "Personal library"}</p><h1 id="archive-title">{selectedCollection?.name ?? "Everything worth returning to."}</h1><p>{selectedCollection?.description ?? "Your saved reading, kept with the notes and context that made it matter."}</p></div><dl className="archive-overview-stats" aria-label="Archive summary"><div><dt>Saved</dt><dd>{filters.collectionItems.length}</dd></div><div><dt>Unread</dt><dd>{filters.counts.unread}</dd></div><div><dt>With notes</dt><dd>{filters.counts.annotated}</dd></div></dl></section>
      <div className="archive-workspace"><ArchiveSidebar data={data} collectionId={collectionId} setCollectionId={setCollectionId} selectedCollection={selectedCollection} newCollection={newCollection} setNewCollection={setNewCollection} newCollectionKind={newCollectionKind} setNewCollectionKind={setNewCollectionKind} newCollectionVisibility={newCollectionVisibility} setNewCollectionVisibility={setNewCollectionVisibility} composerOpen={composerOpen} setComposerOpen={setComposerOpen} createCollection={createCollection} exportMarkdown={exportMarkdown} exportCsv={exportCsv} exportArchiveJson={exportArchiveJson} publication={currentPublication} publishBusy={publishBusy} publishCollection={(visibility, note, attribution) => void publishCollection(selectedCollection!.id, visibility, note, attribution)} unpublishCollection={() => void unpublishCollection(selectedCollection!.id)} sync={sync} retrySync={retrySync} revisions={recovery.revisions} contentSnapshots={recovery.contentSnapshots} recoveryBusy={recovery.recoveryBusy} refreshRecovery={recovery.refreshRecovery} restoreRevision={recovery.restoreRevision} auth={auth} accountBusy={accountBusy} signOut={signOut} deleteAccount={deleteAccount} onNotice={setShareNotice} />
        <ArchiveList data={data} query={filters.query} setQuery={filters.setQuery} filter={filters.filter} setFilter={filters.setFilter} sort={filters.sort} setSort={filters.setSort} counts={filters.counts} visible={filters.visible} patchItem={patchItem} recoveryBusy={recovery.recoveryBusy} captureContent={recovery.captureContent} onNotice={setShareNotice} shareNotice={shareNotice} showPostPanels={auth.status !== "signed-out"} postsByItem={postsByItem} />
      </div>
  </div>;
}

/** Page shell: layout chrome intentionally stays separate from archive workflows. */
export function ArchiveApp() {
  return <AppShell section="archive" footerNote={<><strong>Private by default.</strong> Your archive lives on this device today; shared collections are the next layer.</>}><ArchiveWorkspace /></AppShell>;
}
