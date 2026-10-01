import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Try+ — Coeus",
  description: "Coeus is free to use. Plus plans are coming soon.",
};

export default function PlusPage() {
  return (
    <AppShell section="account">
      <main className="notifications-page">
        <header className="notifications-heading">
          <p className="notifications-kicker">Coeus+</p>
          <h1>Try+</h1>
          <p>Coeus stays free to read, save, and share. Plus plans are coming soon.</p>
        </header>
      </main>
    </AppShell>
  );
}
