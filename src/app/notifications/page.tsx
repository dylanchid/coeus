import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { NotificationsInbox } from "@/components/NotificationsInbox";
import { SupabaseNotificationStore } from "@/lib/notifications/notificationsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const userId = await authenticateArchiveRequest();
  if (!userId) redirect("/signin?next=%2Fnotifications");

  const store = new SupabaseNotificationStore(createAdminSupabaseClient());
  const initialPage = await store.list(userId, { cursor: null, limit: 20 });

  return (
    <AppShell section="account" subline="Activity from the people and posts connected to you.">
      <main className="notifications-page">
        <header className="notifications-heading">
          <p className="notifications-kicker">Your activity</p>
          <h1 id="notifications-heading">Notifications</h1>
          <p>New followers, likes, replies, and reposts appear here.</p>
        </header>
        <NotificationsInbox initialPage={initialPage} />
      </main>
    </AppShell>
  );
}
