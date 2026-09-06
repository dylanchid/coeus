"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useChrome } from "./ChromeProvider";

/**
 * Header account control. Signed out: a "Log in" link. Signed in: an avatar +
 * handle button that opens a small menu (Settings, Edit profile, Sign out).
 * Settings lives here rather than as its own header button — the slash menu's
 * "Open settings" command and the "," shortcut still reach it too.
 */
export function AccountMenu() {
  const { status, user, profile, signOut } = useAuth();
  const { openSettings } = useChrome();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const menuId = useId();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  if (status === "loading") {
    return <span className="account-slot" aria-hidden="true" />;
  }

  if (status === "signed-out") {
    const back = pathname.startsWith("/signin") || pathname === "/welcome" ? "/archive" : pathname;
    return (
      <Link className="account-signin" href={`/signin?next=${encodeURIComponent(back)}`}>
        Log in
      </Link>
    );
  }

  const label = profile ? `@${profile.handle}` : user?.name ?? user?.email ?? "Account";
  const initial = (profile?.handle ?? user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();
  // With a profile, "Edit profile" goes to /@handle — the owner sees their own
  // profile page with the inline editor. Without one, onboarding still owns the
  // flow. This is the change that makes the profile page discoverable to its
  // owner.
  const profileHref = profile ? `/@${profile.handle}` : null;
  const editHref = profileHref ? `${profileHref}?edit=1` : `/welcome?next=${encodeURIComponent(pathname)}`;

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="account-avatar"
          style={user?.avatarUrl ? { backgroundImage: `url("${user.avatarUrl}")` } : undefined}
          aria-hidden="true"
        >
          {user?.avatarUrl ? null : initial}
        </span>
        <span className="account-name">{label}</span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="account-dropdown" id={menuId} role="menu" aria-label="Account">
          {profileHref ? (
            <button type="button" role="menuitem" onClick={() => navigate(profileHref)}>
              View profile
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => navigate(editHref)}>
            {profile ? "Edit profile" : "Finish your profile"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openSettings();
            }}
          >
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-signout"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
