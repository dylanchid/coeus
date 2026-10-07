"use client";

import { useState } from "react";
import Link from "next/link";
import { notifyNotificationsRead } from "./NotificationsButton";
import type { NotificationItem, NotificationPage } from "@/lib/notifications/notifications";
function eventCopy(item: NotificationItem) {
  const actor = item.actor ? `@${item.actor.handle}` : "Someone";
  const verb = item.kind === "like" ? "liked" : item.kind === "reply" ? "replied to" : "reposted";
  if (item.kind === "follow") return <><strong>{actor}</strong> followed you.</>;
  const noun = item.targetType === "collection" ? "collection" : "post";
  return (
    <>
      <strong>{actor}</strong> {verb} your {noun}{" "}
      {item.target ? <Link href={item.target.href}>{item.target.label}</Link> : null}.
    </>
  );
}


export function NotificationsInbox({ initialPage }: { initialPage: NotificationPage }) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [unreadCount, setUnreadCount] = useState(initialPage.unreadCount);
  const [pending, setPending] = useState<"read" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markRead = async () => {
    if (!unreadCount || pending) return;
    setPending("read");
    setError(null);
    try {
      const response = await fetch("/api/notifications", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("request failed");
      const body = (await response.json()) as { unreadCount?: unknown };
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(typeof body.unreadCount === "number" ? body.unreadCount : 0);
      notifyNotificationsRead();
    } catch {
      setError("Notifications could not be marked read. Try again.");
    } finally {
      setPending(null);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || pending) return;
    setPending("more");
    setError(null);
    try {
      const response = await fetch(`/api/notifications?limit=20&cursor=${encodeURIComponent(nextCursor)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("request failed");
      const body = (await response.json()) as { notifications: NotificationItem[]; nextCursor: string | null; hasMore: boolean; unreadCount: number };
      setItems((current) => [...current, ...body.notifications]);
      setNextCursor(body.nextCursor);
      setHasMore(body.hasMore);
      setUnreadCount(body.unreadCount);
    } catch {
      setError("More notifications could not be loaded. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="notifications-inbox" aria-labelledby="notifications-heading">
      <div className="notifications-toolbar">
        <p className="notifications-count">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
        <button type="button" className="notifications-read-button" onClick={() => void markRead()} disabled={!unreadCount || pending !== null}>
          {pending === "read" ? "Marking read…" : "Mark all as read"}
        </button>
      </div>
      {error ? <p className="notifications-error" role="alert">{error}</p> : null}
      {items.length ? (
        <ol className="notification-list">
          {items.map((item) => (
            <li className={`notification-row${item.readAt ? " is-read" : " is-unread"}`} key={item.id}>
              <p className="notification-copy">{eventCopy(item)}</p>
              <time dateTime={item.createdAt}>{item.createdAt.slice(0, 10)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="notifications-empty">Nothing here yet. New follows and conversation activity will appear here.</p>
      )}
      {hasMore ? (
        <button type="button" className="notifications-more" onClick={() => void loadMore()} disabled={pending !== null}>
          {pending === "more" ? "Loading…" : "Load older notifications"}
        </button>
      ) : null}
    </section>
  );
}
