"use client";

import { useEffect, useState } from "react";

/**
 * There is no sign-in UI in this app yet (only signout/delete assume an
 * existing session), so an anonymous visitor's follow attempt surfaces a
 * plain "sign in" message from the 401 rather than pretending a sign-in
 * flow is one click away.
 */
export function FollowButton({ publicationId }: { publicationId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    return () => { cancelled = true; };
  }, [publicationId]);

  const toggle = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(following ? "/api/collections/unfollow" : "/api/collections/follow", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId }),
      });
      if (response.status === 401) { setMessage("Sign in to your Bareaga account to follow collections."); return; }
      if (!response.ok) throw new Error("Request failed");
      setFollowing((current) => !current);
    } catch {
      setMessage("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public-collection-follow">
      <button type="button" disabled={busy || following === null} onClick={() => void toggle()}>
        {following ? "Following ✓" : "Follow"}
      </button>
      {message ? <p className="public-collection-follow-message" role="status">{message}</p> : null}
    </div>
  );
}
