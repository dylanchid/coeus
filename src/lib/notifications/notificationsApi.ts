import {
  decodeNotificationCursor,
  type NotificationPage,
} from "./notifications.ts";
import type { NotificationStore } from "./notificationsStore.server.ts";

export interface NotificationsApiDependencies {
  authenticate(): Promise<string | null>;
  store: NotificationStore;
}

function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store, max-age=0" };
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: headers() });
}

async function actor(dependencies: NotificationsApiDependencies): Promise<string | Response> {
  const userId = await dependencies.authenticate();
  return userId ?? errorResponse("Authentication required", 401);
}

function listRequest(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20;
  return { limit, cursor: decodeNotificationCursor(url.searchParams.get("cursor")) };
}

/** GET /api/notifications — a private keyset page plus the current unread count. */
export async function handleListNotifications(
  request: Request,
  dependencies: NotificationsApiDependencies,
): Promise<Response> {
  const recipientId = await actor(dependencies);
  if (recipientId instanceof Response) return recipientId;
  try {
    const page: NotificationPage = await dependencies.store.list(recipientId, listRequest(request));
    return Response.json({ notifications: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore, unreadCount: page.unreadCount }, { headers: headers() });
  } catch {
    return errorResponse("Notifications are unavailable", 503);
  }
}

/** POST /api/notifications/read — marks every unread notification for the caller read. */
export async function handleMarkNotificationsRead(
  dependencies: NotificationsApiDependencies,
): Promise<Response> {
  const recipientId = await actor(dependencies);
  if (recipientId instanceof Response) return recipientId;
  try {
    const count = await dependencies.store.markAllRead(recipientId);
    return Response.json({ markedRead: count, unreadCount: await dependencies.store.unreadCount(recipientId) }, { headers: headers() });
  } catch {
    return errorResponse("Notifications could not be marked read", 503);
  }
}
