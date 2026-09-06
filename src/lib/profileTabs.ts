/**
 * The profile tab set. Tabs are `?tab=` links rendered server-side — no client
 * island — so they are shareable and crawlable.
 *
 * Phase 1 ships Overview and Collections only. Posts, Reposts, Replies and
 * Likes are omitted entirely until the phase that gives them real data,
 * rather than rendered as dead or greyed affordances.
 */

export type ProfileTabId = "overview" | "collections";

export interface ProfileTab {
  id: ProfileTabId;
  label: string;
  href: string;
  current: boolean;
}

const TABS: { id: ProfileTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "collections", label: "Collections" },
];

/** Coerce a raw `?tab=` value to a live tab; anything unknown falls back to overview (never a 404). */
export function resolveProfileTab(raw: string | string[] | undefined | null): ProfileTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TABS.some((tab) => tab.id === value) ? (value as ProfileTabId) : "overview";
}

export function profileTabs(handle: string, current: ProfileTabId): ProfileTab[] {
  return TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.id === "overview" ? `/@${handle}` : `/@${handle}?tab=${tab.id}`,
    current: tab.id === current,
  }));
}
