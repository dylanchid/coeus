"use client";

import { useState } from "react";
import Link from "next/link";
import type { CollectionPublication, PublicationVisibility } from "@/lib/collectionPublication";
import { VisibilitySelect } from "./VisibilitySelect";

/** Key this component by collection id so its drafts reset on collection changes. */
export function ArchivePublishPanel({ collectionId, publication, busy, onPublish, onUnpublish }: {
  collectionId: string;
  publication: CollectionPublication | undefined;
  busy: boolean;
  onPublish: (visibility: PublicationVisibility, curatorNote: string, attribution: string) => void;
  onUnpublish: () => void;
}) {
  const [visibility, setVisibility] = useState<PublicationVisibility>(publication?.visibility ?? "unlisted");
  const [curatorNote, setCuratorNote] = useState(publication?.curatorNote ?? "");
  const [attribution, setAttribution] = useState(publication?.attribution ?? "");
  return <details className="archive-portability"><summary>Publish &amp; follow</summary><div className="archive-sidebar-actions" aria-label="Publish this collection">
    <p className="archive-sync-state" role="status">{publication ? <>Published at <code>/c/{publication.slug}</code> · {publication.visibility}</> : "Not published yet"}</p>
    <label htmlFor={`publish-visibility-${collectionId}`}>Visibility</label><VisibilitySelect id={`publish-visibility-${collectionId}`} value={visibility} onChange={setVisibility} />
    <label htmlFor={`publish-curator-note-${collectionId}`}>Curator note</label><textarea id={`publish-curator-note-${collectionId}`} value={curatorNote} onChange={(event) => setCuratorNote(event.target.value)} placeholder="Why does this collection matter? What should followers expect?" />
    <label htmlFor={`publish-attribution-${collectionId}`}>Attribution</label><input id={`publish-attribution-${collectionId}`} type="text" value={attribution} onChange={(event) => setAttribution(event.target.value)} placeholder="Curated by…" />
    <button type="button" disabled={busy} onClick={() => onPublish(visibility, curatorNote, attribution)}>{publication ? "Update publication" : "Publish collection"}</button>
    {publication ? <button type="button" className="archive-danger" disabled={busy} onClick={onUnpublish}>Unpublish</button> : null}<Link href="/c">Browse public collections ↗</Link>
  </div></details>;
}
