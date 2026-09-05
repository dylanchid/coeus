import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { WelcomeForm } from "@/components/WelcomeForm";

export const metadata: Metadata = {
  title: "Welcome — Coeus",
  description: "Choose your handle to finish setting up your Coeus account.",
};

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
        <WelcomeForm next={firstValue(params.next)} />
      </div>
    </AppShell>
  );
}
