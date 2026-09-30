export type NotificationKind = "follow" | "like" | "reply" | "repost";

export interface NotificationCursor {
  ts: string;
  id: string;
}

export interface NotificationActor {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface NotificationTarget {
  type: "collection" | "post";
  label: string;
  href: string;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  actor: NotificationActor | null;
  targetType: "collection" | "post" | null;
  target: NotificationTarget | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  hasMore: boolean;
  nextCursor: string | null;
  unreadCount: number;
}

/** URL-safe opaque keyset cursor. The API treats malformed values as page one. */
export function encodeNotificationCursor(cursor: NotificationCursor | null): string | null {
  if (!cursor) return null;
  return Buffer.from(`${cursor.ts}|${cursor.id}`, "utf8").toString("base64url");
}

export function decodeNotificationCursor(raw: string | string[] | undefined | null): NotificationCursor | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !value) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separator = decoded.indexOf("|");
  if (separator <= 0 || separator === decoded.length - 1) return null;
  const ts = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(Date.parse(ts)) || !id) return null;
  return { ts, id };
}
