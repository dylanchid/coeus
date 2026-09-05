import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  DOMException: dom.window.DOMException,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  MouseEvent: dom.window.MouseEvent,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
dom.window.requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};
dom.window.cancelAnimationFrame = () => undefined;
globalThis.fetch = async () => new Response(null, { status: 401 });

const React = await import("react");
const { useState } = React;
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { DEFAULT_PREFS } = await import("@/lib/prefs");
const { SlashMenu } = await import("./SlashMenu");
const { SettingsPanel } = await import("./SettingsPanel");
const { AppProviders, useArchive } = await import("./AppProviders");
const { ShareSheet } = await import("./ShareSheet");
const { AlreadyArchivedButton, PreviewFollowButton } = await import("./DiscoverPreviewControls");
const { SourcesCategoryHub } = await import("./DiscoverSourcesApp");
const { DestinationsPanel } = await import("./DestinationsPanel");
const { LOCAL_ARCHIVE_STORAGE_KEY } = await import("@/lib/localArchiveRepository");

const defaultFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.style.overflow = "";
  globalThis.fetch = defaultFetch;
});

/** Stubs the two endpoints DestinationsPanel reads: the destinations list and per-kind deliveries. */
function stubDestinations(destinations: unknown[], deliveries: Record<string, unknown[]> = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/archive/destinations")) {
      return new Response(JSON.stringify({ destinations }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const match = url.match(/\/api\/archive\/destinations\/([a-z_]+)\/deliveries$/);
    if (match) {
      return new Response(JSON.stringify({ deliveries: deliveries[match[1]] ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

function slashContext(overrides: Record<string, unknown> = {}) {
  return {
    prefs: DEFAULT_PREFS,
    currentSection: "reader",
    onPrefs: () => undefined,
    onOpenSettings: () => undefined,
    onExportPrefs: () => undefined,
    onNavigate: () => undefined,
    ...overrides,
  };
}

test("Slash Menu traps focus, leaves button Enter alone, and restores its opener", async (context) => {
  const navigate = context.mock.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return <div>
      <button type="button" onClick={() => setOpen(true)}>Open commands</button>
      <SlashMenu open={open} onClose={() => setOpen(false)} context={slashContext({ onNavigate: navigate })} />
    </div>;
  }

  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open commands" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Slash menu" });
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole("combobox")));
  assert.equal(opener.inert, true);

  const close = screen.getByRole("button", { name: "Close commands" });
  close.focus();
  fireEvent.keyDown(close, { key: "Enter" });
  assert.equal(navigate.mock.callCount(), 0);
  assert.equal(dialog.contains(document.activeElement), true);

  fireEvent.keyDown(close, { key: "Escape" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null));
  assert.equal(document.activeElement, opener);
  assert.equal(Boolean(opener.inert), false);
  assert.equal(document.body.style.overflow, "");
});

test("Slash Menu surfaces command failures without closing", async () => {
  render(<SlashMenu open onClose={() => undefined} context={slashContext({ onExportPrefs: () => { throw new Error("blocked"); } })} />);
  const option = await screen.findByRole("option", { name: /Export preferences JSON/ });
  fireEvent.click(option);
  assert.match((await screen.findByRole("alert")).textContent ?? "", /failed/i);
  assert.ok(screen.getByRole("dialog"));
});

test("mobile Settings behaves as a modal sheet", async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({
    matches: true,
    media: "(max-width: 700px)",
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  });

  function Harness() {
    const [open, setOpen] = useState(false);
    return <div>
      <button type="button" onClick={() => setOpen(true)}>Open settings</button>
      <SettingsPanel open={open} prefs={DEFAULT_PREFS} onClose={() => setOpen(false)} onChange={() => undefined} />
    </div>;
  }

  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open settings" });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", { name: "Settings" });
  await waitFor(() => assert.equal(document.activeElement, screen.getByRole("button", { name: "Done" })));
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(document.body.style.overflow, "hidden");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => assert.equal(screen.queryByRole("dialog", { name: "Settings" }), null));
  assert.equal(document.activeElement, opener);
  window.matchMedia = originalMatchMedia;
});

const article = {
  id: "article-1",
  sourceId: "source-1",
  title: "A durable link",
  url: "https://example.com/article",
  summary: "A useful excerpt.",
  author: "Author",
  publishedAt: "2026-09-01T00:00:00.000Z",
  ageLabel: "4d",
};

function archiveWith(collections: unknown[]) {
  return { version: 1, collections, items: [], socialPosts: [] };
}

function ShareHarness({ onDone }: { onDone: (message: string) => void }) {
  const { archive } = useArchive();
  const [open, setOpen] = useState(false);
  if (!archive) return <p>Loading</p>;
  return <div>
    <button type="button" onClick={() => setOpen(true)}>Open share</button>
    {open ? <ShareSheet article={article} sourceName="Example" topic="ideas" onClose={() => setOpen(false)} onDone={onDone} /> : null}
  </div>;
}

test("Share Sheet blocks a collection destination when none exists", async () => {
  localStorage.setItem(LOCAL_ARCHIVE_STORAGE_KEY, JSON.stringify(archiveWith([])));
  render(<AppProviders><ShareHarness onDone={() => undefined} /></AppProviders>);
  const opener = await screen.findByRole("button", { name: "Open share" });
  opener.focus();
  fireEvent.click(opener);
  const publicRadio = screen.getByRole("radio", { name: /Public collection/ });
  fireEvent.click(publicRadio);
  assert.ok(screen.getByRole("link", { name: /Create one in Archive/ }));
  assert.equal((screen.getByRole("button", { name: "Save here" }) as HTMLButtonElement).disabled, true);
  fireEvent.keyDown(publicRadio, { key: "ArrowRight" });
  assert.equal(screen.getByRole("radio", { name: /Community collection/ }).getAttribute("aria-checked"), "true");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, opener);
});

test("Share Sheet reports success only after a valid collection is persisted", async () => {
  const collection = { id: "public", name: "Public notes", description: "", visibility: "public", kind: "personal", createdAt: "2026-09-01T00:00:00.000Z" };
  localStorage.setItem(LOCAL_ARCHIVE_STORAGE_KEY, JSON.stringify(archiveWith([collection])));
  let notice = "";
  render(<AppProviders><ShareHarness onDone={(message) => { notice = message; }} /></AppProviders>);
  fireEvent.click(await screen.findByRole("button", { name: "Open share" }));
  fireEvent.click(screen.getByRole("radio", { name: /Public collection/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save here" }));
  await waitFor(() => assert.equal(notice, "Saved to Public notes"));
  const saved = JSON.parse(localStorage.getItem(LOCAL_ARCHIVE_STORAGE_KEY) ?? "null");
  assert.deepEqual(saved.items[0].collectionIds, ["public"]);
});

test("Discover preview controls describe their actual state", () => {
  const view = render(<div><AlreadyArchivedButton /><PreviewFollowButton /></div>);
  assert.equal((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled, true);
  const follow = screen.getByRole("button", { name: "Preview follow" });
  fireEvent.click(follow);
  assert.equal(screen.getByRole("button", { name: "Previewing" }).getAttribute("aria-pressed"), "true");

  view.unmount();
  render(<PreviewFollowButton />);
  assert.ok(screen.getByRole("button", { name: "Preview follow" }));
});

test("Destinations panel surfaces a Notion auth_error as a distinct Reconnect action", async () => {
  stubDestinations(
    [{ id: "d1", kind: "notion", displayName: "Notion — Smoke", status: "auth_error", config: { databaseId: "db1", workspaceName: "Smoke" }, createdAt: "2026-09-05T00:00:00.000Z" }],
    { notion: [{ destinationId: "d1", itemId: "item-7", externalRef: null, lastDeliveredRevision: 0, status: "failed_auth", lastAttemptedAt: "2026-09-05T00:01:00.000Z", lastError: "token expired", lastHttpStatus: 401 }] },
  );
  render(<DestinationsPanel />);

  const reconnect = await screen.findByRole("link", { name: "Reconnect Notion ↗" });
  assert.equal(reconnect.getAttribute("href"), "/api/archive/destinations/notion/oauth/start");
  assert.ok(screen.getByText("Needs reconnect"));
  // failed_auth items read as an auth problem, not a transient "will retry" one.
  fireEvent.click(screen.getByText(/need attention/));
  assert.match(screen.getByText(/Auth expired/).textContent ?? "", /reconnect Notion to retry/);
  assert.equal(screen.queryByText("Will retry automatically"), null);
});

test("Destinations panel shows an active Notion destination without a Reconnect prompt", async () => {
  stubDestinations([
    { id: "d2", kind: "notion", displayName: "Notion — Smoke", status: "active", config: { databaseId: "db1", workspaceName: "Smoke" }, createdAt: "2026-09-05T00:00:00.000Z" },
  ]);
  render(<DestinationsPanel />);

  assert.ok(await screen.findByText("Connected"));
  assert.equal(screen.queryByRole("link", { name: "Reconnect Notion ↗" }), null);
  assert.ok(screen.getByRole("button", { name: "Sync now" }));
});

test("Sources category hub reports category selection and exposes its selected state", () => {
  const select = test.mock.fn();
  const view = render(<SourcesCategoryHub category="all" onSelect={select} />);
  const aiCategory = screen.getByRole("button", { name: "AI" });
  fireEvent.click(aiCategory);
  assert.deepEqual(select.mock.calls[0].arguments, ["AI"]);

  view.rerender(<SourcesCategoryHub category="AI" onSelect={select} />);
  const activeAiCategory = screen.getByRole("button", { name: "AI" });
  assert.equal(activeAiCategory.getAttribute("aria-pressed"), "true");
  fireEvent.click(activeAiCategory);
  assert.deepEqual(select.mock.calls[1].arguments, ["all"]);
});
