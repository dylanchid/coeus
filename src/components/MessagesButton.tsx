"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { MailIcon } from "./HeaderIcons";

/** Always visible; signed-out visitors are sent to log in first. */
export function MessagesButton() {
  const { status } = useAuth();
  const href = status === "signed-out" ? `/signin?next=${encodeURIComponent("/messages")}` : "/messages";
  return (
    <Link className="header-icon-btn" href={href} aria-label="Messages">
      <MailIcon />
    </Link>
  );
}
