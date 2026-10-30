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
  CustomEvent: dom.window.CustomEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, cleanup, fireEvent, render, renderHook, waitFor } = await import("@testing-library/react");
const { DEFAULT_PREFS } = await import("@/lib/prefs");
const { useNewsPrefs } = await import("@/hooks/useNewsPrefs");
const { useSearchField } = await import("@/hooks/useSearchField");
const { useBackToTop } = await import("@/hooks/useBackToTop");
const { ReaderContent } = await import("./ReaderContent");
const { FOCUS_HEADER_SEARCH_EVENT } = await import("./HeaderSearch");

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

test("Reader preference hook keeps topic in the session and persists search edits", () => {
  const patches: unknown[] = [];
  const { result } = renderHook(() => useNewsPrefs((patch) => patches.push(patch)));
  act(() => result.current.changeTopic("tech"));
  assert.equal(result.current.topic, "tech");
  assert.deepEqual(patches, []);
  act(() => result.current.onSearchChange("climate"));
  assert.deepEqual(patches, [{ lastSearch: "climate" }]);
});

test("Reader search hydrates once, focuses header search on ?, and ignores shortcuts while typing", async () => {
  const queries: string[] = [];
  const focusRequests: boolean[] = [];
  let refreshes = 0;
  let closes = 0;
  const onFocus = (event: Event) => focusRequests.push((event as CustomEvent<{ command: boolean }>).detail.command);
  window.addEventListener(FOCUS_HEADER_SEARCH_EVENT, onFocus);
  const props = {
    prefs: { ...DEFAULT_PREFS, lastSearch: "saved" },
    onSearchChange: (value: string) => queries.push(value),
    closeSlash: () => { closes++; },
    slashOpen: false,
    refresh: () => { refreshes++; },
  };
  const { result, rerender } = renderHook(({ value }) => useSearchField({ ...props, prefs: value }), {
    initialProps: { value: props.prefs },
  });
  await waitFor(() => assert.equal(result.current.deferredSearch, "saved"));
  rerender({ value: { ...props.prefs, lastSearch: "later" } });
  assert.equal(result.current.deferredSearch, "saved");
  act(() => result.current.changeSearch("edited"));
  await waitFor(() => assert.equal(result.current.deferredSearch, "edited"));
  assert.deepEqual(queries, ["edited"]);

  fireEvent.keyDown(window, { key: "?" });
  assert.deepEqual(focusRequests, [false]);
  assert.equal(closes, 1);
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "r" });
  assert.equal(refreshes, 0);
  fireEvent.keyDown(window, { key: "r" });
  assert.equal(refreshes, 1);
  input.remove();
  window.removeEventListener(FOCUS_HEADER_SEARCH_EVENT, onFocus);
});

test("Reader back-to-top appears after 1200px and hides at the threshold", () => {
  const { result } = renderHook(() => useBackToTop());
  assert.equal(result.current, false);
  Object.defineProperty(window, "scrollY", { configurable: true, value: 1201 });
  act(() => fireEvent.scroll(window));
  assert.equal(result.current, true);
  Object.defineProperty(window, "scrollY", { configurable: true, value: 1200 });
  act(() => fireEvent.scroll(window));
  assert.equal(result.current, false);
});

test("Reader shows Clear search when a failed source remains but no stories match", () => {
  let cleared = false;
  render(<ReaderContent
    prefs={DEFAULT_PREFS}
    topic="all"
    loading={false}
    sources={[]}
    visible={[{ id: "failed", name: "Failed", topic: "tech", articles: [], error: "Unavailable" }]}
    search="no matches"
    matchCount={0}
    emptyMessage="No sources match this search."
    configuredSourceCount={1}
    clearSearch={() => { cleared = true; }}
    openSources={() => undefined}
    refresh={() => undefined}
    onReorder={() => undefined}
    onRetry={() => undefined}
    savedArticleIds={new Set()}
    onSave={() => undefined}
    onShare={() => undefined}
    onOpen={() => undefined}
  />);
  assert.match(document.body.textContent ?? "", /No sources match this search/);
  fireEvent.click(document.querySelector(".reader-empty button")!);
  assert.equal(cleared, true);
});
