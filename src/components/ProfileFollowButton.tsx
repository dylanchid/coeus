"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const UNDO_MS = 8_000;

/**
 * The follow / unfollow control on someone else's profile.
 *
 * Unlike FollowButton, this island does NOT fetch the followed list on mount
 * to answer one boolean. It takes `initialFollowing` as a prop from the server
 * component, which already knows it: the profile page resolves the viewer's
 * follow relationship anyway, for the `followers` visibility tier (plan risk
 * R5). So the button is correct at first paint, with no round-trip and no
 * loading flicker.
 *
 * A 401 links to /signin for the current path and leaves the follow state
 * unchanged.
 */
export function ProfileFollowButton({
  profileId,
  handle,
  initialFollowing,
}: {
  profileId: string;
  handle: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ReactNode>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => () => {
    if (undoTimer.current !== null) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, []);

  const post = (path: "/api/profiles/follow" | "/api/profiles/unfollow") => fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId }),
  });

  const signInPrompt = () => {
    const next = encodeURIComponent(window.location.pathname);
    return (
      <>
        Sign in to follow @{handle}. <a href={`/signin?next=${next}`}>Sign in</a>
      </>
    );
  };

  const toggle = async () => {
    if (busy) return;
    const wasFollowing = following;
    setBusy(true);
    setMessage(null);
    clearUndoTimer();
    setUndoVisible(false);
    try {
      const response = await post(wasFollowing ? "/api/profiles/unfollow" : "/api/profiles/follow");
      if (response.status === 401) {
        setMessage(signInPrompt());
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setFollowing(!wasFollowing);
      if (!wasFollowing) {
        setMessage(`You’ll hear about @${handle}’s new collections in Discover.`);
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
      const response = await post("/api/profiles/unfollow");
      if (response.status === 401) {
        setUndoVisible(false);
        setMessage(signInPrompt());
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

  const label = following ? `Following @${handle} ✓` : `Follow @${handle}`;

  return (
    <div className="profile-follow">
      <button
        type="button"
        className="follow-control follow-control--secondary"
        aria-pressed={following}
        disabled={busy}
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
