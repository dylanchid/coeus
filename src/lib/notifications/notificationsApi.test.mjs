import assert from "node:assert/strict";
import test from "node:test";

import { handleListNotifications, handleMarkNotificationsRead } from "./notificationsApi.ts";

class MemoryNotificationStore {
  items = [{ id: "n-1", kind: "follow", actor: null, target: null, createdAt: "2026-09-30T00:00:00.000Z", readAt: null }];
  markedFor = [];

  async list(recipientId, request) {
    this.listArgs = [recipientId, request];
    return { items: this.items, hasMore: false, nextCursor: null, unreadCount: this.items.filter((item) => !item.readAt).length };
  }

  async unreadCount() {
    return this.items.filter((item) => !item.readAt).length;
  }

  async markAllRead(recipientId) {
    this.markedFor.push(recipientId);
    for (const item of this.items) item.readAt = "2026-09-30T01:00:00.000Z";
    return this.items.length;
  }
}

function dependencies(store, userId = "user-1") {
  return { authenticate: async () => userId, store };
}

test("notification GET requires authentication and returns a private page", async () => {
  const store = new MemoryNotificationStore();
  const unauthorized = await handleListNotifications(new Request("http://localhost/api/notifications"), dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleListNotifications(
    new Request("http://localhost/api/notifications?limit=500&cursor=bad"),
    dependencies(store),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).notifications, store.items);
  assert.equal(store.listArgs[0], "user-1");
  assert.equal(store.listArgs[1].limit, 50);
  assert.equal(store.listArgs[1].cursor, null);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("notification GET maps store failures to 503", async () => {
  const store = new MemoryNotificationStore();
  store.list = async () => { throw new Error("db down"); };
  const response = await handleListNotifications(new Request("http://localhost/api/notifications"), dependencies(store));
  assert.equal(response.status, 503);
});

test("notification POST marks only the authenticated recipient read", async () => {
  const store = new MemoryNotificationStore();
  const unauthorized = await handleMarkNotificationsRead(dependencies(store, null));
  assert.equal(unauthorized.status, 401);

  const response = await handleMarkNotificationsRead(dependencies(store, "recipient-1"));
  assert.equal(response.status, 200);
  assert.deepEqual(store.markedFor, ["recipient-1"]);
  assert.equal((await response.json()).unreadCount, 0);
});

test("notification POST maps store failures to 503", async () => {
  const store = new MemoryNotificationStore();
  store.markAllRead = async () => { throw new Error("db down"); };
  const response = await handleMarkNotificationsRead(dependencies(store));
  assert.equal(response.status, 503);
});
