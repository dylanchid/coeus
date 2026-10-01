"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useAuth } from "./AuthProvider";
import { WelcomeForm } from "./WelcomeForm";

/**
 * Mounted on authenticated surfaces. When a signed-in account has no profile,
 * keep the current page in place and block it with the onboarding dialog.
 */
export function ProfileGate() {
  const { status } = useAuth();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLElement>(null);
  const open = status === "needs-profile";

  useModalDialog({ active: open, containerRef: dialogRef, onClose: () => undefined });

  if (!open) return null;

  return (
    <div className="profile-gate-backdrop">
      <section
        ref={dialogRef}
        className="profile-gate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-heading"
        tabIndex={-1}
      >
        <WelcomeForm next={pathname || "/archive"} />
      </section>
    </div>
  );
}
