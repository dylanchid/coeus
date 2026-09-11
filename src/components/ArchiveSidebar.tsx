"use client";

import Link from "next/link";
import type { ArchiveCollection, ArchiveData, CollectionKind, CollectionVisibility } from "@/lib/archive";
import type { ContentSnapshotSummary, ArchiveRevisionSummary } from "@/lib/archive/archiveRecovery";
import type { ArchiveSyncState } from "@/lib/archive/syncedArchiveRepository";
import type { AuthStatus, AuthUser } from "./AuthProvider";
import { ArchivePublishPanel } from "./ArchivePublishPanel";
import { DestinationsPanel } from "./DestinationsPanel";
import { VisibilitySelect } from "./VisibilitySelect";
import type { CollectionPublication } from "@/lib/collectionPublication";

type SidebarAuth = { status: AuthStatus; user: AuthUser | null; profile: { handle: string } | null };

/** Collection navigation and account/recovery controls; state remains in ArchiveApp. */
export function ArchiveSidebar({
  data, collectionId, setCollectionId, selectedCollection, newCollection, setNewCollection,
  newCollectionKind, setNewCollectionKind, newCollectionVisibility, setNewCollectionVisibility,
  composerOpen, setComposerOpen, createCollection, exportMarkdown, exportCsv, exportArchiveJson,
  publication, publishBusy, publishCollection, unpublishCollection, sync, retrySync, revisions,
  contentSnapshots, recoveryBusy, refreshRecovery, restoreRevision, auth, accountBusy, signOut,
  deleteAccount, onNotice,
}: {
  data: ArchiveData;
  collectionId: string;
  setCollectionId: (id: string) => void;
  selectedCollection: ArchiveCollection | undefined;
  newCollection: string;
  setNewCollection: (value: string) => void;
  newCollectionKind: CollectionKind;
  setNewCollectionKind: (value: CollectionKind) => void;
  newCollectionVisibility: CollectionVisibility;
  setNewCollectionVisibility: (value: CollectionVisibility) => void;
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  createCollection: () => void;
  exportMarkdown: () => void;
  exportCsv: () => void;
  exportArchiveJson: () => Promise<void>;
  publication: CollectionPublication | undefined;
  publishBusy: boolean;
  publishCollection: (visibility: CollectionPublication["visibility"], curatorNote: string, attribution: string) => void;
  unpublishCollection: () => void;
  sync: ArchiveSyncState;
  retrySync: () => void;
  revisions: ArchiveRevisionSummary[];
  contentSnapshots: ContentSnapshotSummary[];
  recoveryBusy: boolean;
  refreshRecovery: () => Promise<void>;
  restoreRevision: (revision: number) => Promise<void>;
  auth: SidebarAuth;
  accountBusy: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const namedCollections = data.collections.filter((collection) => collection.id !== "inbox");
  const inbox = data.collections.find((collection) => collection.id === "inbox");
  const itemCountIn = (id: string) => data.items.filter((item) => item.collectionIds.includes(id)).length;
  return <aside className="archive-sidebar" aria-label="Archive collections">
    <div className="archive-sidebar-head"><span>Browse library</span><span>{data.items.length} saved</span></div>
    <nav className="archive-collection-nav" aria-label="Library views">
      <button className={collectionId === "all" ? "is-active" : ""} aria-current={collectionId === "all" ? "page" : undefined} onClick={() => setCollectionId("all")}><span><i aria-hidden="true">⌂</i>Everything</span><small>{data.items.length}</small></button>
      {inbox ? <button className={collectionId === inbox.id ? "is-active" : ""} aria-current={collectionId === inbox.id ? "page" : undefined} onClick={() => setCollectionId(inbox.id)}><span><i aria-hidden="true">↓</i>{inbox.name}</span><small>{itemCountIn(inbox.id)}</small></button> : null}
    </nav>
    <div className="archive-collection-label"><span>Collections</span><span>{namedCollections.length}</span></div>
    <nav className="archive-collection-nav" aria-label="Collections">
      {namedCollections.map((collection) => <button key={collection.id} className={collectionId === collection.id ? "is-active" : ""} aria-current={collectionId === collection.id ? "page" : undefined} onClick={() => setCollectionId(collection.id)}><span><i aria-hidden="true">{collection.kind === "community" ? "◎" : "◇"}</i>{collection.name}</span><small>{itemCountIn(collection.id)}</small></button>)}
    </nav>
    {composerOpen ? <form className="collection-composer" onSubmit={(event) => { event.preventDefault(); createCollection(); }}>
      <label htmlFor="new-collection">Collection name</label><input id="new-collection" autoFocus value={newCollection} onChange={(event) => setNewCollection(event.target.value)} placeholder="e.g. Local futures" />
      <label htmlFor="collection-kind">Ownership</label><select id="collection-kind" value={newCollectionKind} onChange={(event) => setNewCollectionKind(event.target.value as CollectionKind)}><option value="personal">Personal</option><option value="community">Community</option></select>
      <label htmlFor="collection-visibility">Visibility</label><VisibilitySelect id="collection-visibility" value={newCollectionVisibility} onChange={setNewCollectionVisibility} />
      <div><button type="submit">Create</button><button type="button" onClick={() => setComposerOpen(false)}>Cancel</button></div>
    </form> : <button className="new-collection-button" onClick={() => setComposerOpen(true)}><span aria-hidden="true">＋</span> New collection</button>}
    <details className="archive-portability"><summary>Export &amp; share</summary><div className="archive-sidebar-actions" aria-label="Archive portability">
      <button type="button" onClick={exportMarkdown}>Markdown <span aria-hidden="true">↓</span></button><button type="button" onClick={exportCsv}>Notion CSV <span aria-hidden="true">↓</span></button><button type="button" onClick={() => void exportArchiveJson()}>Full JSON archive <span aria-hidden="true">↓</span></button>
    </div></details>
    {selectedCollection && selectedCollection.id !== "inbox" ? <ArchivePublishPanel key={selectedCollection.id} collectionId={selectedCollection.id} publication={publication} busy={publishBusy} onPublish={publishCollection} onUnpublish={unpublishCollection} /> : null}
    <details className="archive-portability"><summary>Sync, recovery &amp; account</summary><div className="archive-sidebar-actions" aria-label="Archive sync and recovery">
      <p className="archive-sync-state" role="status">Sync: {sync.status}{sync.pending ? ` · ${sync.pending} queued` : ""}{sync.conflicts ? ` · ${sync.conflicts} conflicts retained` : ""}</p>
      {sync.message && sync.status !== "synced" ? <p className="archive-sync-state" role="status">{sync.message}</p> : null}{sync.recoveredCorruptQueue ? <p className="archive-sync-state" role="alert">A damaged offline queue was set aside for recovery; export your archive if recent edits are missing.</p> : null}{sync.paused ? <button type="button" onClick={retrySync}>Retry sync now</button> : null}
      <button type="button" disabled={recoveryBusy} onClick={() => void refreshRecovery()}>Refresh recovery history</button>{revisions.map((revision) => <button key={revision.revision} type="button" disabled={recoveryBusy} onClick={() => void restoreRevision(revision.revision)}>Restore revision {revision.revision}</button>)}
      {contentSnapshots.length ? <div className="archive-snapshot-list">{contentSnapshots.map((snapshot) => <a key={snapshot.id} href={`/api/archive/snapshots/${snapshot.id}`}>Captured {snapshot.itemId} · {snapshot.status}</a>)}</div> : null}
      {auth.status === "signed-out" ? <><p className="archive-account-state" role="status">Not signed in — this archive stays on this device.</p><Link href="/signin?next=/archive">Sign in to sync ↗</Link></> : auth.status === "loading" ? <p className="archive-account-state" role="status">Checking sign-in…</p> : <><p className="archive-account-state" role="status">{auth.profile ? <>Signed in as <strong>@{auth.profile.handle}</strong></> : "Signed in"}{auth.user?.email ? ` · ${auth.user.email}` : ""}</p>{auth.profile ? <Link href="/welcome?next=/archive">Edit profile</Link> : <Link href="/welcome?next=/archive">Finish setting up your profile ↗</Link>}<button type="button" onClick={() => void signOut()}>Sign out — keep local copy</button><button type="button" className="archive-danger" disabled={recoveryBusy || accountBusy} onClick={() => void deleteAccount()}>Delete cloud account…</button></>}
    </div></details>
    <DestinationsPanel onNotice={onNotice} />
  </aside>;
}
