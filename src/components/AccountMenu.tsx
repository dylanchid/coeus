"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { HeaderMenu } from "./HeaderMenu";
import { CaretIcon } from "./HeaderIcons";

/**
 * Header account control. Signed out: a "Sign up / Log in" link with a gray
 * placeholder circle. Signed in: username, circular avatar and caret that opens the profile menu (View/Edit profile, Sign
 * out). Settings lives in the ⋯ menu next to it.
 */
export function AccountMenu() {
  const { status, user, profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  if (status === "loading") {
    return <span className="account-slot" aria-hidden="true" />;
  }

  if (status === "signed-out") {
    const back = pathname.startsWith("/signin") || pathname === "/welcome" ? "/archive" : pathname;
    return (
      <Link className="account-signin" href={`/signin?next=${encodeURIComponent(back)}`}>
        <span>Sign up / Log in</span>
        <span className="account-avatar is-placeholder" aria-hidden="true" />
      </Link>
    );
  }

  const label = profile ? `@${profile.handle}` : user?.name ?? user?.email ?? "Account";
  const initial = (profile?.handle ?? user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();
  // With a profile, "Edit profile" goes to /@handle — the owner sees their own
  // profile page with the inline editor. Without one, onboarding still owns the
  // flow.
  const profileHref = profile ? `/@${profile.handle}` : null;
  const editHref = profileHref ? `${profileHref}?edit=1` : `/welcome?next=${encodeURIComponent(pathname)}`;

  return (
    <HeaderMenu
      label="Account"
      triggerLabel={`Account menu, ${label}`}
      triggerClassName="account-trigger"
      trigger={
        <>
          <span className="account-name">{label}</span>
          <span
            className="account-avatar"
            style={user?.avatarUrl ? { backgroundImage: `url("${user.avatarUrl}")` } : undefined}
            aria-hidden="true"
          >
            {user?.avatarUrl ? null : initial}
          </span>
          <span className="account-caret"><CaretIcon /></span>
        </>
      }
      items={[
        ...(profileHref ? [{ key: "view", label: "View profile", onSelect: () => router.push(profileHref) }] : []),
        { key: "edit", label: profile ? "Edit profile" : "Finish your profile", onSelect: () => router.push(editHref) },
        { key: "signout", label: "Sign out", danger: true, onSelect: () => void signOut() },
      ]}
    />
  );
}
