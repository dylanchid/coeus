import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLLECTION_SOURCE_TAG,
  parseCollectionSourceId,
  removeFollowedCollectionFromPrefs,
} from "@/lib/feeds/collectionSource";
import { allSources, orderByIds } from "@/lib/feeds/sources";
import type { SourceDef, UserPrefs } from "@/lib/types";
import { useAuth } from "../AuthProvider";
import { AddSourceForm } from "../AddSourceForm";
import type { SettingsChange } from "./SettingsControls";

async function unfollowPublication(publicationId: string): Promise<void> {
  const response = await fetch("/api/collections/unfollow", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicationId }),
  });
  if (!response.ok && response.status !== 401) throw new Error("Unfollow failed");
}

export function SourcesPanel({ prefs, onChange }: { prefs: UserPrefs; onChange: SettingsChange }) {
  const [sourceQuery, setSourceQuery] = useState("");
  const [unfollowBusy, setUnfollowBusy] = useState<string | null>(null);
  const { status } = useAuth();
  const signedIn = status === "ready" || status === "needs-profile";
  const hidden = new Set(prefs.hiddenSources);
  const enabledSources = allSources(prefs.customSources).filter((source) => prefs.sourceOrder.includes(source.id));
  const orderedSources = orderByIds(enabledSources, prefs.sourceOrder);
  const collectionSources = useMemo(
    () => orderedSources.filter((source) => source.tags.includes(COLLECTION_SOURCE_TAG)),
    [orderedSources]
  );
  const otherSources = useMemo(
    () => orderedSources.filter((source) => !source.tags.includes(COLLECTION_SOURCE_TAG)),
    [orderedSources]
  );
  const normalizedSourceQuery = sourceQuery.trim().toLowerCase();
  const filteredSources = otherSources.filter((source) =>
    `${source.name} ${source.topic}`.toLowerCase().includes(normalizedSourceQuery)
  );

  const publicationIds = useRef(new Map<string, string>());

  useEffect(() => {
    if (!signedIn) return;
    void (async () => {
      try {
        const response = await fetch("/api/collections/followed", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { publications: { id: string; slug: string }[] };
        const next = new Map<string, string>();
        for (const row of body.publications) next.set(row.slug, row.id);
        publicationIds.current = next;
      } catch {
        // ignore
      }
    })();
  }, [signedIn]);

  const toggleHidden = (id: string) => {
    const next = new Set(prefs.hiddenSources);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ hiddenSources: [...next] });
  };

  const unfollowCollection = async (source: SourceDef) => {
    const slug = parseCollectionSourceId(source.id);
    if (!slug || unfollowBusy) return;
    setUnfollowBusy(source.id);
    try {
      if (signedIn) {
        const publicationId = publicationIds.current.get(slug);
        if (publicationId) await unfollowPublication(publicationId);
      }
      onChange(removeFollowedCollectionFromPrefs(prefs, slug));
    } finally {
      setUnfollowBusy(null);
    }
  };

  return <>
    <section className="settings-section">
      <h3>Your feeds</h3>
      <AddSourceForm prefs={prefs} onChange={onChange} />
    </section>
    {collectionSources.length ? (
      <section className="settings-section">
        <h3>Collections you follow</h3>
        <ul className="settings-sources settings-sources-collections">
          {collectionSources.map((source) => (
            <li key={source.id}>
              <span>{source.name}</span>
              <button
                type="button"
                disabled={unfollowBusy === source.id}
                onClick={() => void unfollowCollection(source)}
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
    <section className="settings-section">
      <h3>Sources</h3>
      <label className="source-search-label" htmlFor="settings-source-search">Search sources</label>
      <input id="settings-source-search" className="source-search-input" type="search"
        value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Name or topic" />
      <p className="settings-actions">
        <button type="button" onClick={() => onChange({ hiddenSources: [] })}
          disabled={prefs.hiddenSources.length === 0}>Show all</button>
        {" · "}
        <button type="button" onClick={() => onChange({ hiddenSources: orderedSources.map((source) => source.id) })}
          disabled={orderedSources.length > 0 && orderedSources.every((source) => hidden.has(source.id))}>Hide all</button>
      </p>
      <ul className="settings-sources">
        {filteredSources.map((source) => {
          const isHidden = hidden.has(source.id);
          return (
            <li key={source.id} className={isHidden ? "is-hidden" : undefined}>
              <label>
                <input type="checkbox" checked={!isHidden} onChange={() => toggleHidden(source.id)} />
                <span>{source.name}</span>
                <span className="topic-tag">{source.topic}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  </>;
}