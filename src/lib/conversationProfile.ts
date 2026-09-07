/**
 * The public-safe derive boundary for the conversation-layer profile tabs
 * (Phase 3): Likes, Reposts, Replies. The indirect-visibility analogue of
 * deriveProfileView() — every row is dropped unless it clears canSeeIndirect()
 * against the CURRENT state of its target.
 *
 * Pure by contract: no "server-only", no Supabase, no next import. The loader
 * (conversationProfileStore.server.ts) resolves each row's target and the
 * viewer's follow relationship to each distinct target owner, then hands the
 * raw rows here.
 *
 * The derived card types carry NO owner id and NO target uuid — only what
 * renders. `reposts` deliberately stores no denormalised target title, so a
 * card can only ever be built from a freshly-joined target row; if the join
 * came back empty the row is an orphan and drops out here.
 */

import { canSee, canSeeIndirect, type Viewer, type Visibility } from "./visibility.ts";
import type { ProfileSectionSwitches } from "./profileSections.ts";

// ── loaded (raw) shapes ────────────────────────────────────────────────────

/**
 * A like / repost / reply target as the loader resolved it from the live
 * `collection_publications` or `posts` row plus its owner's handle. Null when
 * the target row is gone or (for a collection) currently unpublished.
 */
export type LoadedTarget =
  | {
      kind: "collection";
      slug: string;
      name: string;
      visibility: Visibility;
      ownerId: string;
      ownerHandle: string;
    }
  | {
      kind: "post";
      title: string;
      url: string;
      sourceName: string;
      author: string;
      visibility: Visibility;
      ownerId: string;
      ownerHandle: string;
    };

/** One like or repost row: a timestamp and its (possibly orphaned) target. */
export interface LoadedInteraction {
  createdAt: string;
  target: LoadedTarget | null;
}

/** One reply row. `parentId` supports arbitrary depth in the data; the display
 * caps at two levels (see {@link deriveReplyThreads}). */
export interface LoadedReply {
  id: string;
  parentId: string | null;
  body: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  /** The raw polymorphic target ref — used by the loader to build the owner's
   * compose targets. Never enters a derived card. */
  targetType: "collection" | "post";
  targetId: string;
  target: LoadedTarget | null;
  /** The author handle of this reply's parent — set by the loader for any
   * non-root reply, and used for the "replying to @handle" lead. */
  parentAuthorHandle?: string | null;
}

// ── derived (rendered) shapes ──────────────────────────────────────────────

export type CardTarget =
  | { kind: "collection"; slug: string; name: string; visibility: Visibility; ownerHandle: string }
  | {
      kind: "post";
      title: string;
      url: string;
      sourceName: string;
      author: string;
      visibility: Visibility;
      ownerHandle: string;
    };

/** A Likes-tab or Reposts-tab row. */
export interface ProfileInteractionCard {
  createdAt: string;
  target: CardTarget;
}

export interface ProfileReplyCard {
  id: string;
  body: string;
  visibility: Visibility;
  createdAt: string;
  /** updatedAt differs from createdAt. */
  edited: boolean;
  /** Present only on a flattened level-3+ reply: the handle it responds to. */
  replyingTo?: string | null;
  /** Only a thread root carries its target as rendered context. */
  target?: CardTarget;
}

/** A top-level reply plus its direct responses, flattened to one level. */
export interface ProfileReplyThread {
  reply: ProfileReplyCard;
  responses: ProfileReplyCard[];
}

// ── shared helpers ────────────────────────────────────────────────────────

function toCardTarget(target: LoadedTarget): CardTarget {
  return target.kind === "collection"
    ? {
        kind: "collection",
        slug: target.slug,
        name: target.name,
        visibility: target.visibility,
        ownerHandle: target.ownerHandle,
      }
    : {
        kind: "post",
        title: target.title,
        url: target.url,
        sourceName: target.sourceName,
        author: target.author,
        visibility: target.visibility,
        ownerHandle: target.ownerHandle,
      };
}

function indirectlyVisible(
  rowVisibility: Visibility,
  target: LoadedTarget | null,
  viewer: Viewer,
  viewerFollowsTargetOwner: (ownerId: string) => boolean,
): target is LoadedTarget {
  const resolved = target ? { visibility: target.visibility, ownerId: target.ownerId } : null;
  return canSeeIndirect(
    { visibility: rowVisibility },
    resolved,
    viewer,
    resolved ? viewerFollowsTargetOwner(resolved.ownerId) : false,
  );
}

// ── likes / reposts ───────────────────────────────────────────────────────

/**
 * A like or repost is a PUBLIC act — step 1 of canSeeIndirect always clears.
 * What can fail is step 2: the target's current visibility, judged by the
 * viewer's relationship to the TARGET owner (never to the actor).
 */
export function deriveInteractionFeed(
  rows: readonly LoadedInteraction[],
  viewer: Viewer,
  viewerFollowsTargetOwner: (ownerId: string) => boolean,
): ProfileInteractionCard[] {
  const cards: ProfileInteractionCard[] = [];
  for (const row of rows) {
    if (!indirectlyVisible("public", row.target, viewer, viewerFollowsTargetOwner)) continue;
    cards.push({ createdAt: row.createdAt, target: toCardTarget(row.target) });
  }
  return cards;
}

// ── replies (two-level thread) ────────────────────────────────────────────

/**
 * Build the Replies-tab threads from a flat set of this author's reply rows —
 * their thread roots (parent_id null), the direct responses to those, and one
 * level deeper. Output caps at two rendered levels:
 *
 *   - a thread root renders with its target as context;
 *   - a direct response renders indented once;
 *   - anything deeper renders at that SAME second level, led by
 *     "replying to @handle" (from `parentAuthorHandle`).
 *
 * Unlike likes/reposts, a reply carries its own visibility tier (inherited from
 * the target at creation), so step 1 of canSeeIndirect is the reply's tier
 * against the viewer's relationship to the profile owner. A response whose root
 * is not in the set — its ancestor was authored by someone else — is dropped:
 * it belongs to another profile's thread, not this tab.
 */
export function deriveReplyThreads(
  rows: readonly LoadedReply[],
  viewer: Viewer,
  viewerFollowsTargetOwner: (ownerId: string) => boolean,
): ProfileReplyThread[] {
  const visible = rows.filter((row) =>
    indirectlyVisible(row.visibility, row.target, viewer, viewerFollowsTargetOwner),
  );
  const byId = new Map(visible.map((row) => [row.id, row]));
  const roots = visible.filter((row) => row.parentId === null);
  const rootIds = new Set(roots.map((row) => row.id));

  const card = (row: LoadedReply, extras: Partial<ProfileReplyCard> = {}): ProfileReplyCard => ({
    id: row.id,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt,
    edited: row.updatedAt !== row.createdAt,
    ...extras,
  });

  /** Walk `parent_id` up to a root that is in our set; null if the chain leaves it. */
  const rootOf = (row: LoadedReply): string | null => {
    const seen = new Set<string>();
    let cursor: LoadedReply | undefined = row;
    while (cursor && cursor.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      if (rootIds.has(cursor.parentId)) return cursor.parentId;
      cursor = byId.get(cursor.parentId);
    }
    return null;
  };

  const responsesByRoot = new Map<string, ProfileReplyCard[]>();
  for (const row of visible) {
    if (row.parentId === null) continue;
    const root = rootOf(row);
    if (!root) continue;
    const flattened = row.parentId !== root; // parent is not the root ⇒ level 3+
    const list = responsesByRoot.get(root) ?? [];
    list.push(card(row, flattened ? { replyingTo: row.parentAuthorHandle ?? null } : {}));
    responsesByRoot.set(root, list);
  }

  return roots.map((root) => ({
    reply: card(root, { target: root.target ? toCardTarget(root.target) : undefined }),
    responses: (responsesByRoot.get(root.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)), // oldest response first
  }));
}

// ── the Likes surface gate (tab + sidebar strip together) ─────────────────

export interface LikesSurface {
  /** Render the Likes tab and the sidebar Likes strip at all? */
  render: boolean;
  /** Owner view only: rendered, but marked hidden because show_likes is off. */
  hiddenForOwner: boolean;
}

/**
 * The Likes tab and the sidebar Likes strip are governed together by BOTH the
 * `show_likes` switch (display) and `likes_visibility` (canSee, security).
 *
 *   - the owner always sees them, marked "(hidden)" when the switch is off;
 *   - a visitor sees them only when the switch is on AND `likes_visibility`
 *     admits them — otherwise the count, the strip and the tab are all absent,
 *     never a "0" that would leak the number.
 */
export function likesSurface(switches: ProfileSectionSwitches, viewer: Viewer): LikesSurface {
  if (viewer.kind === "owner") {
    return { render: true, hiddenForOwner: !switches.showLikes };
  }
  const readable = canSee(switches.likesVisibility as Visibility, viewer);
  return { render: switches.showLikes && readable, hiddenForOwner: false };
}
