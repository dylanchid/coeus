import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SignInPanel } from "@/components/SignInPanel";

export const metadata: Metadata = {
  title: "Sign in — Coeus",
  description: "Sign in to sync your archive, publish collections, and connect destinations.",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/welcome";
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
        <SignInPanel next={safeNext(firstValue(params.next))} errorMessage={firstValue(params.error) ?? null} />
      </div>
    </AppShell>
  );
}
