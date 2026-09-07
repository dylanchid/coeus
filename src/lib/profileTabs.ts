/**
 * The profile tab set. Tabs are `?tab=` links rendered server-side — no client
 * island — so they are shareable and crawlable.
 *
 * Overview and Collections are always present. Posts is conditional: `"hidden"`
 * drops it entirely (a visitor with nothing to see), `"greyed"` renders it
 * non-interactive (the owner, who has published nothing yet), `"visible"` is a
 * normal link. Reposts, Replies and Likes arrive in Phase 3 the same way.
 */

export type ProfileTabId = "overview" | "collections" | "posts";

export type PostsTabState = "visible" | "greyed" | "hidden";

export interface ProfileTab {
  id: ProfileTabId;
  label: string;
  href: string;
  current: boolean;
  /** True for a tab that renders as plain text, not a link. */
  greyed: boolean;
}

const ALWAYS: { id: ProfileTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "collections", label: "Collections" },
];

/** Coerce a raw `?tab=` value to a live tab; anything unknown falls back to overview (never a 404). */
export function resolveProfileTab(raw: string | string[] | undefined | null): ProfileTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "collections" || value === "posts" ? value : "overview";
}

export function profileTabs(
  handle: string,
  current: ProfileTabId,
  posts: PostsTabState = "hidden"
): ProfileTab[] {
  const defs = [...ALWAYS];
  if (posts !== "hidden") defs.push({ id: "posts", label: "Posts" });

  return defs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.id === "overview" ? `/@${handle}` : `/@${handle}?tab=${tab.id}`,
    current: tab.id === current,
    greyed: tab.id === "posts" && posts === "greyed",
  }));
}
