/**
 * The profile tab set. Tabs are `?tab=` links rendered server-side — no client
 * island — so they are shareable and crawlable.
 *
 * Overview and Collections are always present. Legacy `?tab=posts|reposts|
 * replies|likes` still resolve through {@link resolveProfileTab} to overview
 * (never a 404).
 */

export type ProfileTabId = "overview" | "collections";

export type TabState = "visible" | "greyed" | "hidden";

/** Legacy conditional tabs' states — kept so ProfileTabs compiles unchanged. */
export type ProfileTabStates = Partial<Record<"posts" | "reposts" | "replies" | "likes", TabState>>;

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

const LEGACY_OVERVIEW = new Set(["posts", "reposts", "replies", "likes"]);

/** Coerce a raw `?tab=` value to a live tab; anything unknown falls back to overview (never a 404). */
export function resolveProfileTab(raw: string | string[] | undefined | null): ProfileTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "collections") return "collections";
  if (typeof value === "string" && LEGACY_OVERVIEW.has(value)) return "overview";
  return "overview";
}

export function profileTabs(
  handle: string,
  current: ProfileTabId,
  states: ProfileTabStates = {},
): ProfileTab[] {
  void states;
  return ALWAYS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.id === "overview" ? `/@${handle}` : `/@${handle}?tab=${tab.id}`,
    current: tab.id === current,
    greyed: false,
  }));
}