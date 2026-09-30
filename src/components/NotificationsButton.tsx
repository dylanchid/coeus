"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

const READ_EVENT = "coeus:notifications-read";

export function NotificationsButton() {
  const { status } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== "ready") return;

    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/notifications?limit=1", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { unreadCount?: unknown };
        if (active && typeof body.unreadCount === "number") setUnreadCount(body.unreadCount);
      } catch {
        // The inbox remains available if the ambient badge request fails.
      }
    };
    const onRead = () => setUnreadCount(0);
    window.addEventListener(READ_EVENT, onRead);
    void refresh();
    return () => {
      active = false;
      window.removeEventListener(READ_EVENT, onRead);
    };
  }, [status]);

  if (status !== "ready") return null;

  return (
    <Link
      className="notifications-button"
      href="/notifications"
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <span>Notifications</span>
      {unreadCount ? <span className="nav-count">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
    </Link>
  );
}

export function notifyNotificationsRead() {
  window.dispatchEvent(new Event(READ_EVENT));
}
