import { handleListNotifications, handleMarkNotificationsRead } from "@/lib/notifications/notificationsApi";
import { SupabaseNotificationStore } from "@/lib/notifications/notificationsStore.server";
import { authenticateArchiveRequest, createAdminSupabaseClient } from "@/lib/supabase.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function dependencies() {
  return { authenticate: authenticateArchiveRequest, store: new SupabaseNotificationStore(createAdminSupabaseClient()) };
}

export async function GET(request: Request): Promise<Response> {
  return instrument(
    { route: "notifications", operation: "handleListNotifications", correlationId: requestCorrelationId(request) },
    () => handleListNotifications(request, dependencies()),
  );
}

export async function POST(request: Request): Promise<Response> {
  return instrument(
    { route: "notifications.read", operation: "handleMarkNotificationsRead", correlationId: requestCorrelationId(request) },
    () => handleMarkNotificationsRead(dependencies()),
  );
}
