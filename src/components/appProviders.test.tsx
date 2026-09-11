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
dom.window.requestAnimationFrame = (callback) => {
  callback(0);
  return 1;
};
dom.window.cancelAnimationFrame = () => undefined;
// Keep the archive sync loop from making real network calls: an unauthenticated
// response parks the repository in `auth_required` without touching persistence.
globalThis.fetch = async () => new Response(null, { status: 401 });

await import("react");
const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { AppProviders, usePreferences, useArchive } = await import("./AppProviders");
const { DEFAULT_PREFS } = await import("@/lib/prefs");
const { LOCAL_ARCHIVE_STORAGE_KEY } = await import("@/lib/archive/localArchiveRepository");
const { ARCHIVE_SYNC_VERSION } = await import("@/lib/archiveSync");

const PREFS_STORAGE_KEY = "coeus.prefs.v1";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function validItem(id: string) {
  return {
    id,
    articleId: id,
    title: "A durable link",
    url: "https://example.com/article",
    sourceName: "Example",
    topic: "tech",
    summary: "A useful excerpt.",
    author: "Author",
    savedAt: "2026-09-01T00:00:00.000Z",
    publishedAt: "2026-09-01T00:00:00.000Z",
    note: "",
    collectionIds: [] as string[],
    tags: [] as string[],
    state: "kept" as const,
    starred: false,
  };
}

const emptyArchive = { version: 1, collections: [], items: [] as ReturnType<typeof validItem>[], socialPosts: [] };

function Harness({ onArchiveResult }: { onArchiveResult?: (ok: boolean) => void } = {}) {
  const { prefs, updatePrefs, persistence: prefsPersistence, retryPersistence, flushPersistence } = usePreferences();
  const { archive, updateArchive, sync, replaceArchiveFromServer } = useArchive();
  if (!prefs || !archive) return <p>Loading</p>;
  return (
    <div>
      <p data-testid="palette">{prefs.palette}</p>
      <p data-testid="prefs-status">{prefsPersistence.status}</p>
      <p data-testid="items">{archive.items.length}</p>
      <p data-testid="sync">{sync.status}</p>
      <button type="button" onClick={() => updatePrefs({ palette: "copper" })}>set palette</button>
      <button type="button" onClick={retryPersistence}>retry prefs</button>
      <button type="button" onClick={flushPersistence}>flush prefs</button>
      <button
        type="button"
        onClick={async () => {
          const ok = await updateArchive((current) => ({
            ...current,
            items: [...current.items, validItem(`item-${current.items.length}`)],
          }));
          onArchiveResult?.(ok);
        }}
      >
        add item
      </button>
      <button
        type="button"
        onClick={() =>
          void replaceArchiveFromServer("archive-1", {
            syncVersion: ARCHIVE_SYNC_VERSION,
            revision: 3,
            generatedAt: "2026-09-09T00:00:00.000Z",
            archive: { version: 1, collections: [], items: [validItem("from-server")], socialPosts: [] },
            entityVersions: {},
          })
        }
      >
        replace from server
      </button>
    </div>
  );
}

test("preferences: the first render hydrates without writing back to the store", async () => {
  render(<AppProviders><Harness /></AppProviders>);
  await screen.findByTestId("palette");
  // Give the debounced save effect ample time to fire if the initial render were
  // (incorrectly) treated as a user edit.
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  assert.equal(localStorage.getItem(PREFS_STORAGE_KEY), null);
  assert.equal(screen.getByTestId("prefs-status").textContent, "idle");
});

test("preferences: a user edit persists to the prefs store", async () => {
  render(<AppProviders><Harness /></AppProviders>);
  await screen.findByTestId("palette");
  fireEvent.click(screen.getByRole("button", { name: "set palette" }));
  assert.equal(screen.getByTestId("palette").textContent, "copper");
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "null");
    assert.equal(saved?.palette, "copper");
  });
  await waitFor(() => assert.equal(screen.getByTestId("prefs-status").textContent, "saved"));
});

test("preferences: flushPersistence writes a pending edit without waiting for the debounce", async () => {
  render(<AppProviders><Harness /></AppProviders>);
  await screen.findByTestId("palette");
  fireEvent.click(screen.getByRole("button", { name: "set palette" }));
  fireEvent.click(screen.getByRole("button", { name: "flush prefs" }));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "null");
    assert.equal(saved?.palette, "copper");
  });
});

test("archive: an update is applied optimistically and enqueued to local persistence", async () => {
  localStorage.setItem(LOCAL_ARCHIVE_STORAGE_KEY, JSON.stringify(emptyArchive));
  let result: boolean | undefined;
  render(<AppProviders><Harness onArchiveResult={(ok) => { result = ok; }} /></AppProviders>);
  await waitFor(() => assert.equal(screen.getByTestId("items").textContent, "0"));
  fireEvent.click(screen.getByRole("button", { name: "add item" }));
  assert.equal(screen.getByTestId("items").textContent, "1");
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(LOCAL_ARCHIVE_STORAGE_KEY) ?? "null");
    assert.equal(saved?.items?.length, 1);
  });
  assert.equal(result, true);
});

test("archive: replaceArchiveFromServer swaps the in-memory archive and settles sync state", async () => {
  localStorage.setItem(LOCAL_ARCHIVE_STORAGE_KEY, JSON.stringify(emptyArchive));
  render(<AppProviders><Harness /></AppProviders>);
  await waitFor(() => assert.equal(screen.getByTestId("items").textContent, "0"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "replace from server" })); });
  await waitFor(() => assert.equal(screen.getByTestId("items").textContent, "1"));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(LOCAL_ARCHIVE_STORAGE_KEY) ?? "null");
    assert.equal(saved?.items?.[0]?.id, "from-server");
  });
  assert.equal(screen.getByTestId("sync").textContent, "synced");
});

test("preferences: retryPersistence re-attempts a save without a preceding edit", async () => {
  render(<AppProviders><Harness /></AppProviders>);
  await screen.findByTestId("palette");
  fireEvent.click(screen.getByRole("button", { name: "retry prefs" }));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "null");
    assert.equal(saved?.palette, DEFAULT_PREFS.palette);
  });
  await waitFor(() => assert.equal(screen.getByTestId("prefs-status").textContent, "saved"));
});
