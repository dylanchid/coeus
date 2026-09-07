"use client";

import { useState, type ReactNode } from "react";

/**
 * The follow / unfollow control on someone else's profile — FollowButton.tsx
 * with a different endpoint and one structural change.
 *
 * Unlike FollowButton, this island does NOT fetch the followed list on mount
 * to answer one boolean. It takes `initialFollowing` as a prop from the server
 * component, which already knows it: the profile page resolves the viewer's
 * follow relationship anyway, for the `followers` visibility tier (plan risk
 * R5). So the button is correct at first paint, with no round-trip and no
 * loading flicker.
 *
 * The 401 branch links to /signin — a sign-in flow now exists, so the copy is
 * an invitation, not the apology FollowButton still carries.
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

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(following ? "/api/profiles/unfollow" : "/api/profiles/follow", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (response.status === 401) {
        const next = encodeURIComponent(`/@${handle}`);
        setMessage(
          <>
            Sign in to follow @{handle}. <a href={`/signin?next=${next}`}>Sign in</a>
          </>
        );
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setFollowing((current) => !current);
    } catch {
      setMessage("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-follow">
      <button
        type="button"
        className="profile-follow-button"
        aria-pressed={following}
        disabled={busy}
        onClick={() => void toggle()}
      >
        {following ? "Following ✓" : "Follow"}
      </button>
      {message ? (
        <p className="profile-follow-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
