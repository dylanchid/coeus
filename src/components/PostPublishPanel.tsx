"use client";

import { useState } from "react";
import type { Visibility } from "@/lib/visibility";
import { VisibilityGlyph } from "./VisibilityGlyph";
import { VisibilitySelect } from "./VisibilitySelect";

/**
 * The per-item "Publish as post" control in ArchiveApp — the post analogue of
 * the collection PublishPanel, and a self-contained island like SectionSwitches:
 * it POSTs to /api/posts/{publish,unpublish} itself and keeps its own state.
 *
 * A post is one sourced clip. The server derives title / url / excerpt from its
 * own synced archive data; this panel sends only the owner's three choices:
 * itemLocalId (fixed), visibility and commentary. An item that has not synced
 * yet comes back 404 — surfaced here, not swallowed.
 *
 * Keyed by itemLocalId in the parent so switching items resets the draft.
 */
export interface PublishedPost {
  visibility: Visibility;
  commentary: string;
}

export function PostPublishPanel({
  itemLocalId,
  initialPost = null,
}: {
  itemLocalId: string;
  /** The post already published for this item, if any. */
  initialPost?: PublishedPost | null;
}) {
  const [post, setPost] = useState<PublishedPost | null>(initialPost);
  const [visibility, setVisibility] = useState<Visibility>(initialPost?.visibility ?? "private");
  const [commentary, setCommentary] = useState(initialPost?.commentary ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const publish = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/posts/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemLocalId, visibility, commentary }),
      });
      if (response.status === 404) {
        setMessage("Sync this item first — it isn’t in your synced archive yet.");
        return;
      }
      if (!response.ok) throw new Error("Request failed");
      setPost({ visibility, commentary });
      setMessage(post ? "Post updated." : "Published.");
    } catch {
      setMessage("That didn’t work — try again.");
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/posts/unpublish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemLocalId }),
      });
      if (!response.ok && response.status !== 404) throw new Error("Request failed");
      setPost(null);
      setMessage("Unpublished.");
    } catch {
      setMessage("That didn’t work — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="archive-post-publish">
      <summary>
        {post ? (
          <>
            Published post <VisibilityGlyph visibility={post.visibility} />
          </>
        ) : (
          "Publish as post"
        )}
      </summary>
      <div className="archive-post-publish-body">
        <label>
          <span>Your commentary</span>
          <textarea
            value={commentary}
            onChange={(event) => setCommentary(event.target.value)}
            placeholder="Why is this worth carrying into the conversation?"
          />
        </label>
        <label>
          <span>Visibility</span>
          <VisibilitySelect value={visibility} onChange={setVisibility} />
        </label>
        <button type="button" disabled={busy} onClick={() => void publish()}>
          {post ? "Update post" : "Publish post"}
        </button>
        {post ? (
          <button type="button" className="archive-danger" disabled={busy} onClick={() => void unpublish()}>
            Unpublish
          </button>
        ) : null}
        {message ? (
          <p className="archive-post-publish-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
