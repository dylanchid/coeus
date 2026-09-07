"use client";

import { useState } from "react";
import type { PublicationVisibility } from "@/lib/collectionPublication";

/**
 * The owner-only control strip in the profile sidebar: the five `show_*`
 * toggles under a "Show on profile" label, and a separate "Who sees your
 * likes" control, as the mockup models them.
 *
 * Each toggle is an INDEPENDENT PATCH to /api/account/profile/sections. The
 * change is applied optimistically and, if the request fails, that one field
 * rolls back to its previous value — the other toggles are untouched — and the
 * failure is announced through role="status". Never rendered for a visitor.
 */
export interface SectionSwitchesState {
  showFollowers: boolean;
  showFollowing: boolean;
  showReposts: boolean;
  showReplies: boolean;
  showLikes: boolean;
  likesVisibility: PublicationVisibility;
}

type ToggleKey = "showFollowers" | "showFollowing" | "showReposts" | "showReplies" | "showLikes";

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: "showFollowers", label: "Followers" },
  { key: "showFollowing", label: "Following" },
  { key: "showReposts", label: "Reposts" },
  { key: "showReplies", label: "Replies" },
  { key: "showLikes", label: "Likes" },
];

const LIKES_OPTIONS: { value: PublicationVisibility; label: string }[] = [
  { value: "public", label: "Anyone" },
  { value: "followers", label: "Followers" },
  { value: "private", label: "Only me" },
];

export function SectionSwitches({
  isOwner,
  initial,
}: {
  isOwner: boolean;
  initial: SectionSwitchesState;
}) {
  const [state, setState] = useState<SectionSwitchesState>(initial);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");

  // A visitor never sees this — display, not just decoration.
  if (!isOwner) return null;

  const save = async <K extends keyof SectionSwitchesState>(
    field: K,
    value: SectionSwitchesState[K],
    previous: SectionSwitchesState[K]
  ) => {
    setState((current) => ({ ...current, [field]: value }));
    setPending((current) => new Set(current).add(field));
    setError("");
    try {
      const response = await fetch("/api/account/profile/sections", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!response.ok) throw new Error("Request failed");
    } catch {
      // Revert only this field; a concurrent toggle of another one is a
      // separate functional update and is not clobbered.
      setState((current) => ({ ...current, [field]: previous }));
      setError("Couldn’t save that change — try again.");
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(field);
        return next;
      });
    }
  };

  return (
    <div className="section-switches">
      <fieldset className="section-switches-group">
        <legend>Show on profile</legend>
        <div className="section-switches-pills">
          {TOGGLES.map(({ key, label }) => {
            const on = state[key];
            return (
              <button
                key={key}
                type="button"
                className="section-switch"
                role="switch"
                aria-checked={on}
                disabled={pending.has(key)}
                onClick={() => void save(key, !on, on)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="section-likes-visibility">
        <span>Who sees your likes</span>
        <select
          value={state.likesVisibility}
          disabled={pending.has("likesVisibility")}
          onChange={(event) =>
            void save(
              "likesVisibility",
              event.target.value as PublicationVisibility,
              state.likesVisibility
            )
          }
        >
          {LIKES_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="section-switches-error" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
