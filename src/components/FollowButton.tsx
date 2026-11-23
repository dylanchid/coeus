"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const UNDO_MS = 8_000;
const FOLLOWED_CONFIRMATION = "Following. You’ll find it in Discover · Following.";

/**
 * Follow a published collection. The button reads /api/collections/followed on
 * mount and stays disabled until that answer arrives. A 401 links to sign-in
 * and leaves the follow state unchanged.
 */
export function FollowButton({ publicationId }: { publicationId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ReactNode>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [trackedPublicationId, setTrackedPublicationId] = useState(publicationId);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (trackedPublicationId !== publicationId) {
    setTrackedPublicationId(publicationId);
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
    void (async () => {
      try {
        const response = await fetch("/api/collections/followed", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) { if (!cancelled) setFollowing(false); return; }
        const body = await response.json() as { publications: { id: string }[] };
        if (!cancelled) setFollowing(body.publications.some((entry) => entry.id === publicationId));
      } catch {
        if (!cancelled) setFollowing(false);
      }
    })();
    return () => {
      cancelled = true;
      if (undoTimer.current !== null) {
        clearTimeout(undoTimer.current);
        undoTimer.current = null;
      }
    };
  }, [publicationId]);

  const post = (path: "/api/collections/follow" | "/api/collections/unfollow") => fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicationId }),
  });

  const signInPrompt = (text: string) => {
    const next = encodeURIComponent(window.location.pathname);
    return (
      <>
        {text}{" "}
        <a href={`/signin?next=${next}`}>Sign in</a>
      </>
    );
  };

  const toggle = async () => {
    if (following === null || busy) return;
    const wasFollowing = following;
    setBusy(true);
    setMessage(null);
    clearUndoTimer();
    setUndoVisible(false);
    try {
      const response = await post(wasFollowing ? "/api/collections/unfollow" : "/api/collections/follow");
      if (response.status === 401) {
        setMessage(signInPrompt("Sign in to follow this collection."));
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setFollowing(!wasFollowing);
      if (!wasFollowing) {
        setMessage(FOLLOWED_CONFIRMATION);
        armUndo();
      }
    } catch {
      setMessage("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (busy) return;
    setBusy(true);
    clearUndoTimer();
    try {
      const response = await post("/api/collections/unfollow");
      if (response.status === 401) {
        setUndoVisible(false);
        setMessage(signInPrompt("Sign in to follow this collection."));
        return;
      }
      if (!response.ok) throw new Error("Request failed");
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
        disabled={busy || following === null}
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
