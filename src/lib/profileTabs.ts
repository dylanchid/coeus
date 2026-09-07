/**
 * The profile tab set. Tabs are `?tab=` links rendered server-side — no client
 * island — so they are shareable and crawlable.
 *
 * Overview and Collections are always present. Posts, Reposts, Replies and
 * Likes are each conditional, with the same three states:
 *   - `"visible"` — a normal link;
 *   - `"greyed"`  — rendered as plain text (the owner, with nothing there yet);
 *   - `"hidden"`  — absent entirely (a visitor with nothing to see, or a
 *                   section switched off / gated away).
 */

export type ProfileTabId = "overview" | "collections" | "posts" | "reposts" | "replies" | "likes";

export type TabState = "visible" | "greyed" | "hidden";

/** The conditional tabs' states, keyed by id. Omitted ⇒ `"hidden"`. */
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

const CONDITIONAL: { id: "posts" | "reposts" | "replies" | "likes"; label: string }[] = [
  { id: "posts", label: "Posts" },
  { id: "reposts", label: "Reposts" },
  { id: "replies", label: "Replies" },
  { id: "likes", label: "Likes" },
];

const RESOLVABLE = new Set<string>(["collections", "posts", "reposts", "replies", "likes"]);

/** Coerce a raw `?tab=` value to a live tab; anything unknown falls back to overview (never a 404). */
export function resolveProfileTab(raw: string | string[] | undefined | null): ProfileTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && RESOLVABLE.has(value) ? (value as ProfileTabId) : "overview";
}

export function profileTabs(
  handle: string,
  current: ProfileTabId,
  states: ProfileTabStates = {},
): ProfileTab[] {
  const defs = [...ALWAYS];
  for (const tab of CONDITIONAL) {
    if ((states[tab.id] ?? "hidden") !== "hidden") defs.push(tab);
  }

  return defs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.id === "overview" ? `/@${handle}` : `/@${handle}?tab=${tab.id}`,
    current: tab.id === current,
    greyed: tab.id !== "overview" && tab.id !== "collections" && states[tab.id as keyof ProfileTabStates] === "greyed",
  }));
}
