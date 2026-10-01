"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useAuth } from "./AuthProvider";
import { HeaderMenu } from "./HeaderMenu";
import { CaretIcon } from "./HeaderIcons";
import { SignInPanel } from "./SignInPanel";

const localDevSignIn = process.env.NODE_ENV !== "production";

/**
 * Header account control. Signed out: a "Sign up / Log in" modal trigger with a gray
 * placeholder circle. Signed in: username, circular avatar and caret that opens the profile menu (View/Edit profile, Sign
 * out). Settings lives in the ⋯ menu next to it.
 */
export function AccountMenu() {
  const { status, user, profile, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [signinOpen, setSigninOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useModalDialog({ active: signinOpen, containerRef: dialogRef, onClose: () => setSigninOpen(false) });

  if (status === "loading") {
    return <span className="account-slot" aria-hidden="true" />;
  }

  if (status === "signed-out") {
    const back = pathname.startsWith("/signin") || pathname === "/welcome" ? "/archive" : pathname;
    return (
      <>
        <button className="account-signin" type="button" onClick={() => setSigninOpen(true)}>
          <span>Sign up / Log in</span>
          <span className="account-avatar is-placeholder" aria-hidden="true" />
        </button>
        {signinOpen ? (
          <div
            className="profile-gate-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSigninOpen(false);
            }}
          >
            <section
              ref={dialogRef}
              className="profile-gate-modal auth-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="signin-heading"
              tabIndex={-1}
            >
              <SignInPanel next={back} devSignIn={localDevSignIn} compact />
            </section>
          </div>
        ) : null}
      </>
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
