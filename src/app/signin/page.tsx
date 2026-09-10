import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SignInPanel } from "@/components/SignInPanel";
import { devSignInEnabled } from "@/lib/devAuth.server";
import { safeInternalPath } from "@/lib/safeRedirect";

export const metadata: Metadata = {
  title: "Sign in — Coeus",
  description: "Sign in to sync your archive, publish collections, and connect destinations.",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AppShell section="account">
      <div className="signin-page">
        <SignInPanel
          next={safeInternalPath(firstValue(params.next), "/welcome")}
          errorMessage={firstValue(params.error) ?? null}
          devSignIn={devSignInEnabled()}
        />
      </div>
    </AppShell>
  );
}
