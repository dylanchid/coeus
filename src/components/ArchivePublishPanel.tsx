"use client";

import { useState } from "react";
import Link from "next/link";
import type { CollectionPublication, PublicationVisibility } from "@/lib/publications/collectionPublication";
import { VisibilitySelect } from "./VisibilitySelect";

/** Key this component by collection id so its drafts reset on collection changes. */
/**
 * What a not-yet-published collection should publish as: what the owner
 * already chose for it, except that "private" (the creation default) means
 * they haven't decided, so the safe link-only option is offered instead.
 */
export function defaultPublishVisibility(collectionVisibility: PublicationVisibility): PublicationVisibility {
  return collectionVisibility === "private" ? "unlisted" : collectionVisibility;
}

export function ArchivePublishPanel({ collectionId, collectionVisibility, waitingForSync, publication, busy, onPublish, onUnpublish }: {
  collectionId: string;
  collectionVisibility: PublicationVisibility;
  /** Publishing reads the server's copy of the archive, so it waits until local changes have synced. */
  waitingForSync: boolean;
  publication: CollectionPublication | undefined;
  busy: boolean;
  onPublish: (visibility: PublicationVisibility, curatorNote: string, attribution: string) => void;
  onUnpublish: () => void;
}) {
  const [visibility, setVisibility] = useState<PublicationVisibility>(publication?.visibility ?? defaultPublishVisibility(collectionVisibility));
  const [curatorNote, setCuratorNote] = useState(publication?.curatorNote ?? "");
  const [attribution, setAttribution] = useState(publication?.attribution ?? "");
  // Open by default until the collection is published: publishing is the next
  // step for a curator, so it shouldn't hide behind a collapsed disclosure.
  // Decided once per mount, so a successful publish doesn't snap the panel
  // shut over the new link (the parent keys this component by collection).
  const [startOpen] = useState(!publication);
  return <details className="archive-portability" open={startOpen || undefined}><summary>Publish &amp; follow</summary><div className="archive-sidebar-actions" aria-label="Publish this collection">
    <p className="archive-sync-state" role="status">{publication ? <>Published at <Link href={`/c/${publication.slug}`}>/c/{publication.slug}</Link> · {publication.visibility}</> : "Not published yet"}</p>
    <label htmlFor={`publish-visibility-${collectionId}`}>Visibility</label><VisibilitySelect id={`publish-visibility-${collectionId}`} value={visibility} onChange={setVisibility} />
    <label htmlFor={`publish-curator-note-${collectionId}`}>Curator note</label><textarea id={`publish-curator-note-${collectionId}`} value={curatorNote} onChange={(event) => setCuratorNote(event.target.value)} placeholder="Why does this collection matter? What should followers expect?" />
    <label htmlFor={`publish-attribution-${collectionId}`}>Attribution</label><input id={`publish-attribution-${collectionId}`} type="text" value={attribution} onChange={(event) => setAttribution(event.target.value)} placeholder="Curated by…" />
    <button type="button" className="archive-primary-action" disabled={busy || waitingForSync} onClick={() => onPublish(visibility, curatorNote, attribution)}>{waitingForSync ? "Saving your changes…" : publication ? "Update publication" : "Publish collection"}</button>
    {publication ? <button type="button" className="archive-danger" disabled={busy} onClick={onUnpublish}>Unpublish</button> : null}<Link href="/c">Browse public collections ↗</Link>
  </div></details>;
}
