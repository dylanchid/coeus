"use client";

import { useEffect, useState } from "react";
import type { CollectionPublication, PublicationVisibility } from "@/lib/collectionPublication";

type RequestJson = (url: string, init?: RequestInit) => Promise<Response>;

/** Publication status and writes are independent from archive browsing state. */
export function usePublications(requestJson: RequestJson, onNotice: (notice: string) => void) {
  const [publications, setPublications] = useState<CollectionPublication[]>([]);
  const [publishBusy, setPublishBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/collections", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ publications: CollectionPublication[] }> : null)
      .then((body) => { if (!cancelled && body) setPublications(body.publications); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const publishCollection = async (collectionLocalId: string, visibility: PublicationVisibility, curatorNote: string, attribution: string) => {
    setPublishBusy(true);
    try {
      const response = await requestJson("/api/collections/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionLocalId, visibility, curatorNote, attribution }) });
      const publication = await response.json() as CollectionPublication;
      setPublications((current) => [publication, ...current.filter((entry) => entry.id !== publication.id)]);
      const link = `${window.location.origin}/c/${publication.slug}`;
      try { await navigator.clipboard.writeText(link); onNotice(`Published at /c/${publication.slug} — link copied`); }
      catch { onNotice(`Published at /c/${publication.slug}`); }
    } catch (error) { onNotice(error instanceof Error ? error.message : "Publishing failed"); }
    finally { setPublishBusy(false); }
  };
  const unpublishCollection = async (collectionLocalId: string) => {
    setPublishBusy(true);
    try {
      await requestJson("/api/collections/unpublish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionLocalId }) });
      setPublications((current) => current.map((entry) => entry.collectionLocalId === collectionLocalId ? { ...entry, unpublishedAt: new Date().toISOString() } : entry));
      onNotice("Collection unpublished");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Unpublishing failed"); }
    finally { setPublishBusy(false); }
  };
  return { publications, publishBusy, publishCollection, unpublishCollection };
}
