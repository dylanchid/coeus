import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { authenticateArchiveRequest } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const userId = await authenticateArchiveRequest();
  if (!userId) redirect("/signin?next=%2Fmessages");

  return (
    <AppShell section="account">
      <main className="notifications-page">
        <header className="notifications-heading">
          <p className="notifications-kicker">Your inbox</p>
          <h1>Messages</h1>
          <p>Direct messages are coming soon.</p>
        </header>
      </main>
    </AppShell>
  );
}
