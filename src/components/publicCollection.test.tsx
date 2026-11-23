import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/c/demo" });
let clipboardText = "";
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (value: string) => {
      clipboardText = value;
    },
  },
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
  getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const { cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { ArchivePublishPanel } = await import("./ArchivePublishPanel");
const { CopyLinkButton } = await import("./CopyLinkButton");

afterEach(() => {
  cleanup();
  clipboardText = "";
});

test("publish ladder radiogroup exposes three steps with helper text", () => {
  render(
    <ArchivePublishPanel
      collectionId="demo"
      collectionVisibility="private"
      waitingForSync={false}
      publication={undefined}
      busy={false}
      onPublish={() => undefined}
      onUnpublish={() => undefined}
    />,
  );
  fireEvent.click(screen.getByText("Publish & follow"));
  const group = screen.getByRole("radiogroup", { name: "Visibility" });
  assert.equal(group.querySelectorAll('[role="radio"]').length, 3);
  fireEvent.click(screen.getByRole("radio", { name: "Published" }));
  assert.match(screen.getByText(/Listed in Discover/).textContent ?? "", /Discover/);
});

test("legacy followers step appears until another tier is chosen", () => {
  render(
    <ArchivePublishPanel
      collectionId="legacy"
      collectionVisibility="followers"
      waitingForSync={false}
      publication={{
        id: "pub-1",
        archiveId: "a",
        ownerId: "o",
        collectionLocalId: "legacy",
        slug: "legacy",
        visibility: "followers",
        name: "Legacy",
        description: "",
        curatorNote: "",
        attribution: "",
        items: [],
        publishedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        unpublishedAt: null,
      }}
      busy={false}
      onPublish={() => undefined}
      onUnpublish={() => undefined}
    />,
  );
  fireEvent.click(screen.getByText("Publish & follow"));
  assert.equal(screen.getByRole("radio", { name: /Followers only \(legacy\)/ }).getAttribute("aria-checked"), "true");
  fireEvent.click(screen.getByRole("radio", { name: "Unlisted" }));
  assert.equal(screen.queryByRole("radio", { name: /Followers only \(legacy\)/ }), null);
});

test("ladder radiogroup moves focus with arrow keys", () => {
  render(
    <ArchivePublishPanel
      collectionId="keys"
      collectionVisibility="private"
      waitingForSync={false}
      publication={undefined}
      busy={false}
      onPublish={() => undefined}
      onUnpublish={() => undefined}
    />,
  );
  fireEvent.click(screen.getByText("Publish & follow"));
  const unlisted = screen.getByRole("radio", { name: "Unlisted" });
  unlisted.focus();
  fireEvent.keyDown(unlisted, { key: "ArrowDown" });
  assert.equal(screen.getByRole("radio", { name: "Published" }).getAttribute("aria-checked"), "true");
});

test("CopyLinkButton writes the canonical url and confirms", async () => {
  const url = "https://coeus.example/c/demo";
  render(<CopyLinkButton url={url} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  assert.equal(clipboardText, url);
  await screen.findByRole("button", { name: "Copied ✓" });
});