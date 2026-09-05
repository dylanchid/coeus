"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

/**
 * Renders nothing. Mounted on authenticated surfaces (the Archive): once a
 * signed-in account is known to have no profile, it is sent to /welcome to
 * finish onboarding, with `next` set so it lands back here afterward.
 */
export function ProfileGate() {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "needs-profile") {
      router.replace(`/welcome?next=${encodeURIComponent(pathname || "/archive")}`);
    }
  }, [status, pathname, router]);

  return null;
}
