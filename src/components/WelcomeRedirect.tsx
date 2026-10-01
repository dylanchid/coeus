"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { safeInternalPath } from "@/lib/safeRedirect";
import { useAuth } from "./AuthProvider";

/**
 * Legacy /welcome entry point. Profile creation is the global ProfileGate
 * modal, and editing lives inline on /@handle, so this route only forwards:
 * signed-out → /signin, with a profile → the inline editor, and a new account
 * stays put under the gate until it saves (then continues to `next`).
 */
export function WelcomeRedirect({ next: rawNext }: { next?: string }) {
  const router = useRouter();
  const { status, profile } = useAuth();
  const next = safeInternalPath(rawNext, "/archive");

  useEffect(() => {
    if (status === "signed-out") router.replace(`/signin?next=${encodeURIComponent("/welcome")}`);
    else if (status === "ready") router.replace(profile ? `/@${profile.handle}?edit=1` : next);
  }, [status, profile, next, router]);

  return null;
}
