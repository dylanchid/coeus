import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/notifications" });
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  DOMException: dom.window.DOMException,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const { cleanup, render, screen, fireEvent, waitFor } = await import("@testing-library/react");
const { NotificationsInbox } = await import("./NotificationsInbox");

const basePage = {
  items: [
    {
      id: "n-1",
      kind: "follow" as const,
      actor: { handle: "ada", displayName: "Ada", avatarUrl: null },
      target: null,
      targetType: null,
      createdAt: "2026-09-30T00:00:00.000Z",
      readAt: null,
    },
    {
      id: "n-2",
      kind: "like" as const,
      actor: null,
      target: { type: "post" as const, label: "A useful post", href: "/@owner?tab=posts" },
      targetType: "post" as const,
      createdAt: "2026-09-29T00:00:00.000Z",
      readAt: "2026-09-29T01:00:00.000Z",
    },
    {
      id: "n-3",
      kind: "reply" as const,
      actor: { handle: "bea", displayName: "Bea", avatarUrl: null },
      target: null,
      targetType: "collection" as const,
      createdAt: "2026-09-28T00:00:00.000Z",
      readAt: "2026-09-28T01:00:00.000Z",
    },
  ],
  hasMore: false,
  nextCursor: null,
  unreadCount: 1,
};

afterEach(() => {
  cleanup();
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

test("notifications inbox renders all event context and preserves hidden target safety", () => {
  render(<NotificationsInbox initialPage={basePage} />);
  assert.equal(screen.getByText("@ada").textContent, "@ada");
  assert.ok(screen.getByText("followed you."));
  assert.equal(screen.getByText("Someone").textContent, "Someone");
  assert.match(screen.getAllByRole("listitem")[1].textContent ?? "", /liked.*your post/);
  assert.equal(screen.getByRole("link", { name: "A useful post" }).getAttribute("href"), "/@owner?tab=posts");
  assert.match(screen.getAllByRole("listitem")[2].textContent ?? "", /your collection/);
  assert.equal(screen.getByText("1 unread").textContent, "1 unread");
});

test("notifications inbox marks the authenticated account read and notifies the header", async () => {
  const events: Event[] = [];
  window.addEventListener("coeus:notifications-read", (event) => events.push(event));
  globalThis.fetch = (async () => new Response(JSON.stringify({ markedRead: 1, unreadCount: 0 }), { status: 200 })) as typeof fetch;
  render(<NotificationsInbox initialPage={basePage} />);

  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  await waitFor(() => assert.ok(screen.getByText("All caught up")));
  assert.equal(events.length, 1);
  assert.equal(screen.getByRole("button", { name: "Mark all as read" }).hasAttribute("disabled"), true);
});
