import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { WelcomeRedirect } from "@/components/WelcomeRedirect";
import { pageMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = pageMetadata({
  title: "Welcome",
  path: "/welcome",
  description: "Choose your handle to finish setting up your Coeus account.",
  noindex: true,
});

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <AppShell section="account">
      <div className="welcome-page">
        <WelcomeRedirect next={firstValue(params.next)} />
      </div>
    </AppShell>
  );
}
