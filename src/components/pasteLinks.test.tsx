import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/archive" });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  CustomEvent: dom.window.CustomEvent, Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLElement.prototype.scrollIntoView = () => undefined;
dom.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 1; };

const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { PasteLinksDialog } = await import("./PasteLinksDialog.tsx");
const { parsePastedLinks } = await import("../lib/archive/pasteLinks.ts");

afterEach(cleanup);

const data = {
  version: 1 as const,
  items: [],
  collections: [{ id: "reading", name: "Reading list", description: "", visibility: "private" as const, kind: "personal" as const, createdAt: "2026-01-01T00:00:00.000Z" }],
  socialPosts: [],
};

test("PasteLinksDialog parse metadata matches acceptance counts", () => {
  const lines = [
    ...Array.from({ length: 15 }, (_, index) => `https://example.com/${index}`),
    "https://example.com/0",
    "ftp://bad.test/x",
  ];
  const parsed = parsePastedLinks(lines.join("\n"));
  assert.equal(parsed.links.length, 15);
  assert.equal(parsed.duplicatesSkipped, 1);
  assert.equal(parsed.notWebLink, 1);
});

test("PasteLinksDialog review flow enables add N entries", async () => {
  const applies: unknown[] = [];
  globalThis.fetch = (async () => new Response(JSON.stringify([
    { url: "https://a.test", ok: true, title: "A", sourceName: "A", author: "", excerpt: "" },
  ]), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;

  render(
    <PasteLinksDialog
      open
      onClose={() => undefined}
      collectionId="reading"
      collectionName="Reading list"
      data={data}
      onApply={async (recipe) => { applies.push(recipe(data)); return true; }}
      onNotice={() => undefined}
    />,
  );

  fireEvent.change(screen.getByLabelText(/One URL per line/), { target: { value: "https://a.test\n" } });
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  await screen.findByRole("button", { name: "Add 1 entry" });
  fireEvent.click(screen.getByRole("button", { name: "Add 1 entry" }));
  await waitFor(() => assert.equal(applies.length, 1));
});