/**
 * The public-safe derive boundary for the dedicated thread page
 * (`/@handle/replies/[replyId]`, bareaga_web-kxe). The profile Replies tab caps
 * a thread at two rendered levels and REPLY_DESCENDANT_LIMIT rows per level;
 * this page walks EVERY descendant of one root, oldest first, paginated.
 *
 * Pure by contract — no "server-only", no Supabase, no next import — so the
 * visibility rules are testable under `node --test` with no database. It reuses
 * the exact gates from conversationProfile.ts:
 *
 *   - the root must clear canSeeIndirect() against its target's CURRENT state
 *     (indirectlyVisible). If it does not, the whole page is a 404 — a thread
 *     whose target was made private must not leak through its own URL.
 *   - every descendant is re-checked the same way. A private-tier reply under a
 *     public root drops out for a stranger.
 *
 * Cards carry NO author id and NO target uuid — only handles and rendered text —
 * matching the "no id crosses" rule the profile derive works to.
 */

import {
  indirectlyVisible,
  toCardTarget,
  type CardTarget,
  type LoadedReply,
} from "./conversationProfile.ts";
import type { Viewer, Visibility } from "./visibility.ts";

/** One reply on the thread page. Flattened to a chronological list — depth is a
 * "replying to @handle" lead, never indentation, so the body measure holds at
 * 320px no matter how deep the real tree goes. */
export interface ThreadReplyCard {
  id: string;
  body: string;
  visibility: Visibility;
  createdAt: string;
  edited: boolean;
  authorHandle: string;
  /** The parent's author handle, or null when the parent is the thread root
   * (those responses render with no lead). */
  replyingTo: string | null;
}

export interface ThreadRootCard {
  id: string;
  body: string;
  visibility: Visibility;
  createdAt: string;
  edited: boolean;
  authorHandle: string;
  /** The collection or post the thread hangs off, as rendered context. */
  target: CardTarget;
}

export interface ThreadView {
  root: ThreadRootCard;
  replies: ThreadReplyCard[];
}

/** A descendant reply as the loader resolved it: the raw row plus the author
 * handles the derive needs. */
export interface LoadedThreadReply extends LoadedReply {
  authorHandle: string;
  /** Author handle of this row's parent (any depth). */
  parentAuthorHandle: string | null;
}

function edited(row: { createdAt: string; updatedAt: string }): boolean {
  return row.updatedAt !== row.createdAt;
}

/**
 * Build the thread view for one root and a page of its descendants.
 *
 * Returns null when the root is not visible to `viewer` — the route turns that
 * into notFound(). `rootAuthorHandle` is passed separately because the root row
 * is loaded on its own (it is not one of the descendants).
 */
export function deriveThreadView(
  root: LoadedReply,
  rootAuthorHandle: string,
  descendants: readonly LoadedThreadReply[],
  viewer: Viewer,
  viewerFollowsTargetOwner: (ownerId: string) => boolean,
): ThreadView | null {
  if (!indirectlyVisible(root.visibility, root.target, viewer, viewerFollowsTargetOwner)) {
    return null;
  }

  const replies: ThreadReplyCard[] = [];
  for (const row of descendants) {
    if (!indirectlyVisible(row.visibility, row.target, viewer, viewerFollowsTargetOwner)) continue;
    replies.push({
      id: row.id,
      body: row.body,
      visibility: row.visibility,
      createdAt: row.createdAt,
      edited: edited(row),
      authorHandle: row.authorHandle,
      replyingTo: row.parentId === root.id ? null : row.parentAuthorHandle,
    });
  }

  return {
    root: {
      id: root.id,
      body: root.body,
      visibility: root.visibility,
      createdAt: root.createdAt,
      edited: edited(root),
      authorHandle: rootAuthorHandle,
      target: toCardTarget(root.target),
    },
    replies,
  };
}
