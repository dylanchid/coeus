"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addFollowedCollectionToPrefs,
  hasCollectionSourceInPrefs,
  removeFollowedCollectionFromPrefs,
} from "@/lib/feeds/collectionSource";
import { useAuth } from "./AuthProvider";
import { usePreferences } from "./AppProviders";

const UNDO_MS = 8_000;
const FOLLOWED_CONFIRMATION = "New entries will appear in your Reader.";
const SIGNED_OUT_HINT = "Sign in to keep it on every device.";

/**
 * Follow a published collection into the Reader. Signed-out visitors persist the
 * source locally; signed-in visitors also write collection_follows.
 */
export function FollowButton({
  publicationId,
  slug,
  name,
  curatorHandle,
}: {
  publicationId: string;
  slug: string;
  name: string;
  curatorHandle?: string;
}) {
  const { status } = useAuth();
  const { prefs, updatePrefs } = usePreferences();
  const signedIn = status === "ready" || status === "needs-profile";
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ReactNode>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [trackedKey, setTrackedKey] = useState(`${publicationId}:${slug}`);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (trackedKey !== `${publicationId}:${slug}`) {
    setTrackedKey(`${publicationId}:${slug}`);
    setFollowing(null);
    setMessage(null);
    setUndoVisible(false);
  }

  const clearUndoTimer = () => {
    if (undoTimer.current !== null) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  };

  const armUndo = () => {
    clearUndoTimer();
    setUndoVisible(true);
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null;
      setUndoVisible(false);
    }, UNDO_MS);
  };

  useEffect(() => {
    let cancelled = false;
    const fromPrefs = prefs ? hasCollectionSourceInPrefs(prefs, slug) : false;

    const applyLocal = () => {
      if (!cancelled) setFollowing(fromPrefs);
    };

    if (!signedIn) {
      if (prefs) applyLocal();
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const response = await fetch("/api/collections/followed", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setFollowing(fromPrefs);
          return;
        }
        const body = await response.json() as { publications: { id: string }[] };
        const apiFollowing = body.publications.some((entry) => entry.id === publicationId);
        if (!cancelled) setFollowing(apiFollowing || fromPrefs);
      } catch {
        if (!cancelled) setFollowing(fromPrefs);
      }
    })();

    return () => {
      cancelled = true;
      if (undoTimer.current !== null) {
        clearTimeout(undoTimer.current);
        undoTimer.current = null;
      }
    };
  }, [publicationId, slug, signedIn, prefs]);

  const post = (path: "/api/collections/follow" | "/api/collections/unfollow") => fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicationId }),
  });

  const addToReader = () => {
    if (!prefs) return;
    updatePrefs(addFollowedCollectionToPrefs(prefs, { slug, name, curatorHandle }));
  };

  const removeFromReader = () => {
    if (!prefs) return;
    updatePrefs(removeFollowedCollectionFromPrefs(prefs, slug));
  };

  const confirmation = (extra?: ReactNode) => (
  <>
    {FOLLOWED_CONFIRMATION}
    {!signedIn ? (
      <>
        {" "}
        <span className="follow-confirmation-quiet">{SIGNED_OUT_HINT}</span>
      </>
    ) : null}
    {extra}
  </>
  );

  const toggle = async () => {
    if (following === null || busy || !prefs) return;
    const wasFollowing = following;
    setBusy(true);
    setMessage(null);
    clearUndoTimer();
    setUndoVisible(false);
    try {
      if (!wasFollowing) {
        if (signedIn) {
          const response = await post("/api/collections/follow");
          if (response.status === 401) {
            addToReader();
            setFollowing(true);
            setMessage(confirmation());
            armUndo();
            return;
          }
          if (!response.ok) throw new Error("Request failed");
        }
        addToReader();
        setFollowing(true);
        setMessage(confirmation());
        armUndo();
        return;
      }

      if (signedIn) {
        const response = await post("/api/collections/unfollow");
        if (!response.ok && response.status !== 401) throw new Error("Request failed");
      }
      removeFromReader();
      setFollowing(false);
    } catch {
      setMessage("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy || !prefs) return;
    setBusy(true);
    clearUndoTimer();
    try {
      if (signedIn) {
        const response = await post("/api/collections/unfollow");
        if (!response.ok && response.status !== 401) throw new Error("Request failed");
      }
      removeFromReader();
      setFollowing(false);
      setMessage(null);
      setUndoVisible(false);
    } catch {
      setUndoVisible(false);
      setMessage("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const label = following ? "Following collection ✓" : "Follow collection";

  return (
    <div className="public-collection-follow">
      <button
        type="button"
        className="follow-control follow-control--primary"
        aria-pressed={following === true}
        disabled={busy || following === null || !prefs}
        onClick={() => void toggle()}
      >
        {label}
      </button>
      {message || undoVisible ? (
        <div className="follow-confirmation" role="status">
          {message}
          {undoVisible ? (
            <button type="button" disabled={busy} onClick={() => void undo()}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}