"use client";

import { useState } from "react";
import { VisibilitySelect } from "./VisibilitySelect";
import type { TargetType } from "@/lib/conversation";
import type { Visibility } from "@/lib/visibility";

const MAX_BODY = 4000;

/**
 * The reply composer — a small client island. It reuses {@link VisibilitySelect}
 * from the Phase 2 authoring work, shown read-only: a reply's tier is inherited
 * from its target on the server (`create_reply`), so the control is an honest
 * indicator of where the reply will land, not a choice.
 *
 * On success the page is refreshed so the new reply renders through the same
 * server derive as every other row — no optimistic client-side threading.
 */
export function ReplyComposer({
  targetType,
  targetId,
  parentId = null,
  targetVisibility,
  onPosted,
  placeholder = "Write a reply…",
}: {
  targetType: TargetType;
  targetId: string;
  /** Set when replying within a thread rather than to the target directly. */
  parentId?: string | null;
  /** The target's current tier — the reply inherits it. */
  targetVisibility: Visibility;
  onPosted?: () => void;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const trimmed = body.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_BODY && !pending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/replies", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, parentId, body: trimmed }),
      });
      if (response.status === 401) {
        setError("Sign in to reply.");
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setBody("");
      onPosted?.();
    } catch {
      setError("Couldn’t post that reply — try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="reply-composer" onSubmit={submit}>
      <textarea
        className="reply-composer-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_BODY}
        rows={2}
        placeholder={placeholder}
        aria-label="Reply"
      />
      <div className="reply-composer-actions">
        <label className="reply-composer-visibility">
          <span>Visible to</span>
          <VisibilitySelect
            value={targetVisibility}
            onChange={() => {}}
            disabled
            allow={[targetVisibility]}
          />
        </label>
        <button type="submit" className="reply-composer-submit" disabled={!canSubmit}>
          {pending ? "Posting…" : "Reply"}
        </button>
      </div>
      {error ? (
        <p className="reply-composer-error" role="status">
          {error}
        </p>
      ) : null}
    </form>
  );
}
