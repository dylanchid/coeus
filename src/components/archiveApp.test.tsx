import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/archive" });
Object.assign(globalThis, {
  window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node, DOMException: dom.window.DOMException, CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent, MouseEvent: dom.window.MouseEvent,
  getComputedStyle: dom.window.getComputedStyle, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
Object.defineProperty(dom.window.navigator, "clipboard", { configurable: true, value: { writeText: async () => undefined } });
dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
dom.window.requestAnimationFrame = (callback) => { callback(0); return 1; };
dom.window.cancelAnimationFrame = () => undefined;

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
const { AppProviders } = await import("./AppProviders");
const { ArchiveWorkspace } = await import("./ArchiveApp");
const { createDemoArchive } = await import("@/lib/archiveFixtures");
const { LOCAL_ARCHIVE_STORAGE_KEY } = await import("@/lib/localArchiveRepository");

const defaultFetch = globalThis.fetch;
afterEach(() => { cleanup(); localStorage.clear(); globalThis.fetch = defaultFetch; });

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderArchive() {
  const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined };
  localStorage.setItem(LOCAL_ARCHIVE_STORAGE_KEY, JSON.stringify(createDemoArchive()));
  return render(<AppRouterContext.Provider value={router as never}><PathnameContext.Provider value="/archive"><AppProviders><ArchiveWorkspace /></AppProviders></PathnameContext.Provider></AppRouterContext.Provider>);
}

function stubArchiveFetch(handler: (url: string, method: string, body: string | undefined) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, (init?.method ?? "GET").toUpperCase(), typeof init?.body === "string" ? init.body : undefined);
  }) as typeof fetch;
}

test("Archive browse filters and title sort narrow the rendered pieces", async () => {
  stubArchiveFetch((url) => {
    if (url === "/api/collections") return response({ publications: [] });
    if (url === "/api/posts") return response({ posts: [] });
    if (url === "/api/archive/destinations") return response({ destinations: [] });
    return response({ error: "not found" }, 404);
  });
  renderArchive();
  await screen.findByRole("heading", { name: "Everything worth returning to." });
  fireEvent.click(screen.getByRole("button", { name: "Starred2" }));
  fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "title" } });
  await waitFor(() => assert.match(screen.getByText(/2 pieces/).textContent ?? "", /2 pieces/));
  const titles = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent ?? "");
  assert.ok(titles[0].startsWith("An app can be a home-cooked meal"));
  assert.ok(titles[1].startsWith("The Internet is for End Users"));
  assert.equal(screen.queryByRole("heading", { name: /digital garden/i }), null);
});

test("Archive recovery loads history and surfaces a request error", async () => {
  let fail = false;
  stubArchiveFetch((url) => {
    if (url === "/api/collections") return response({ publications: [] });
    if (url === "/api/posts") return response({ posts: [] });
    if (url === "/api/archive/destinations") return response({ destinations: [] });
    if (url === "/api/archive/revisions") return fail ? response({ error: "History is unavailable" }, 503) : response({ revisions: [{ revision: 7, createdAt: "2026-09-08T00:00:00.000Z" }] });
    if (url === "/api/archive/export") return response({ contentSnapshots: [{ id: "snapshot-1", itemId: "demo-gardens", status: "ready" }] });
    return response({ error: "not found" }, 404);
  });
  renderArchive();
  await screen.findByRole("heading", { name: "Everything worth returning to." });
  fireEvent.click(screen.getByRole("button", { name: "Refresh recovery history" }));
  await screen.findByRole("button", { name: "Restore revision 7" });
  assert.ok(screen.getByRole("link", { name: "Captured demo-gardens · ready" }));
  assert.ok(screen.getByText("Recovery history refreshed"));
  fail = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh recovery history" }));
  await screen.findByText("History is unavailable");
});

test("Archive collection publishing and unpublishing round-trip through their requests", async () => {
  const calls: { url: string; method: string; body: string | undefined }[] = [];
  const publication = { id: "publication-1", archiveId: "archive-1", ownerId: "owner-1", collectionLocalId: "humane-internet", slug: "humane-internet", visibility: "public", name: "A humane internet", description: "", curatorNote: "", attribution: "", items: [], publishedAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z", unpublishedAt: null };
  stubArchiveFetch((url, method, body) => {
    calls.push({ url, method, body });
    if (url === "/api/collections") return response({ publications: [] });
    if (url === "/api/posts") return response({ posts: [] });
    if (url === "/api/archive/destinations") return response({ destinations: [] });
    if (url === "/api/collections/publish") return response(publication);
    if (url === "/api/collections/unpublish") return response({ ok: true });
    return response({ error: "not found" }, 404);
  });
  renderArchive();
  await screen.findByRole("heading", { name: "Everything worth returning to." });
  fireEvent.click(screen.getByRole("button", { name: /a humane internet/i }));
  fireEvent.click(screen.getByText("Publish & follow"));
  fireEvent.change(screen.getByLabelText("Visibility"), { target: { value: "public" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish collection" }));
  await screen.findByRole("button", { name: "Unpublish" });
  const publishCall = calls.find((call) => call.url === "/api/collections/publish");
  assert.equal(publishCall?.method, "POST");
  assert.deepEqual(JSON.parse(publishCall?.body ?? "{}"), { collectionLocalId: "humane-internet", visibility: "public", curatorNote: "", attribution: "" });
  fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
  await waitFor(() => assert.ok(calls.some((call) => call.url === "/api/collections/unpublish" && call.method === "POST")));
  const unpublishCall = calls.find((call) => call.url === "/api/collections/unpublish");
  assert.deepEqual(JSON.parse(unpublishCall?.body ?? "{}"), { collectionLocalId: "humane-internet" });
  await screen.findByText("Collection unpublished");
});
