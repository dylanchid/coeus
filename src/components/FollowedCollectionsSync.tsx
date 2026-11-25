"use client";

import { useEffect, useRef } from "react";
import {
  mergeFollowedCollections,
  type FollowedCollectionRow,
} from "@/lib/feeds/collectionSource";
import { useAuth } from "./AuthProvider";
import { usePreferences } from "./AppProviders";

/**
 * Once per session, reconcile Reader collection sources with collection_follows
 * for signed-in users after auth and prefs are both ready.
 */
export function FollowedCollectionsSync() {
  const { status } = useAuth();
  const { prefs, updatePrefs } = usePreferences();
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    if (status !== "ready" && status !== "needs-profile") return;
    if (!prefs) return;
    synced.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/collections/followed", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = await response.json() as {
          publications: Array<{
            id: string;
            slug: string;
            name: string;
            curatorHandle?: string;
          }>;
        };
        const publications: FollowedCollectionRow[] = body.publications.map((entry) => ({
          id: entry.id,
          slug: entry.slug,
          name: entry.name,
          curatorHandle: entry.curatorHandle,
        }));
        const next = mergeFollowedCollections(prefs, publications);
        if (JSON.stringify(next.customSources) !== JSON.stringify(prefs.customSources)
          || JSON.stringify(next.sourceOrder) !== JSON.stringify(prefs.sourceOrder)) {
          updatePrefs(next);
        }
      } catch {
        synced.current = false;
      }
    })();
  }, [status, prefs, updatePrefs]);

  return null;
}