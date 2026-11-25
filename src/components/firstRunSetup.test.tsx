import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

const hookPath = join(tmpdir(), "coeus-first-run-navigation-hook.mjs");
writeFileSync(
  hookPath,
  `export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/navigation") {
    const body =
      "export function useRouter(){return{push(){},replace(){},refresh(){},back(){},forward(){},prefetch(){}};}" +
      "export function usePathname(){return '/';}" +
      "export function useSearchParams(){return new URLSearchParams();}";
    return { url: "data:text/javascript," + encodeURIComponent(body), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
`,
);
register(hookPath, import.meta.url);

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});

Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  KeyboardEvent: dom.window.KeyboardEvent,
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
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
globalThis.fetch = async () => new Response(null, { status: 401 });

const React = await import("react");
const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { defaultSourceOrder } = await import("@/lib/feeds/sources");
const { readStoredPrefsSnapshot } = await import("@/lib/prefs");
const { SETUP_STORAGE_KEY } = await import("@/lib/setup/firstRun");
const { FirstRunSetup, FirstRunReaderHint, dismissFirstRunHint } = await import("./FirstRunSetup");
const { AuthProvider } = await import("./AuthProvider");

function fakeAuthClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

function renderFirstRun(props: Parameters<typeof FirstRunSetup>[0]) {
  return render(
    React.createElement(
      AuthProvider,
      { client: fakeAuthClient() as never },
      React.createElement(FirstRunSetup, props),
    ),
  );
}

function makePrefs() {
  return {
    version: 1 as const,
    customSources: [],
    sourceOrder: defaultSourceOrder(),
    hiddenSources: [],
    theme: "system" as const,
    limit: 10,
    hours: 24,
    lastSearch: "",
    showSummaries: false,
    showAuthors: false,
    showAges: true,
    showEngagement: true,
    columns: 3 as const,
    homeView: "grid" as const,
    storyRepresentation: "detailed" as const,
    articlePreviewMode: "ask" as const,
    font: "mono" as const,
    palette: "ink" as const,
    density: "comfortable" as const,
    keywordRules: [],
    sourceWeights: {},
    sourceRatings: {},
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.style.overflow = "";
});

test("readStoredPrefsSnapshot detects legacy keys without parsing", () => {
  localStorage.setItem("bareaga.prefs.v1", "{}");
  const snap = readStoredPrefsSnapshot(localStorage);
  assert.equal(snap.hasStoredPrefs, true);
  assert.equal(snap.hasLegacyBareagaKey, true);
});

test("FirstRunSetup step one renders dialog copy and Skip control", () => {
  const html = renderToString(
    React.createElement(FirstRunSetup, {
      open: true,
      prefs: makePrefs(),
      onUpdatePrefs: () => undefined,
      onFinished: () => undefined,
    })
  );
  assert.match(html, /Pick a few worlds to start with/);
  assert.match(html, /Skip, just read/);
  assert.equal((html.match(/Subject areas/g) ?? []).length, 1);
});

test("FirstRunSetup Continue moves to step two with Claim an @handle heading", async () => {
  renderFirstRun({
    open: true,
    prefs: makePrefs(),
    onUpdatePrefs: () => undefined,
    onFinished: () => undefined,
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Culture/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
  assert.ok(await screen.findByRole("heading", { name: /Claim an @handle/i }));
  assert.equal(screen.queryByRole("heading", { name: /Sign in to Coeus/i }), null);
});

test("FirstRunSetup step two Skip writes done", async () => {
  renderFirstRun({
    open: true,
    prefs: makePrefs(),
    onUpdatePrefs: () => undefined,
    onFinished: () => undefined,
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Culture/i }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
  await act(async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Skip, just read" }));
  });
  const record = JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "{}");
  assert.equal(record.status, "done");
});

test("FirstRunSetup dialog exposes modal semantics for the focus trap", async () => {
  renderFirstRun({
    open: true,
    prefs: makePrefs(),
    onUpdatePrefs: () => undefined,
    onFinished: () => undefined,
  });
  const dialog = screen.getByRole("dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(dialog.getAttribute("tabindex"), "-1");
  await act(async () => {
    fireEvent.keyDown(document, { key: "Tab", code: "Tab", bubbles: true });
  });
  assert.ok(dialog.contains(document.activeElement));
});

test("FirstRunSetup escape on step one writes skipped", async () => {
  render(
    React.createElement(FirstRunSetup, {
      open: true,
      prefs: makePrefs(),
      onUpdatePrefs: () => undefined,
      onFinished: () => undefined,
    })
  );
  await act(async () => {
    fireEvent.keyDown(document, { key: "Escape", code: "Escape", bubbles: true });
  });
  assert.equal(localStorage.getItem(SETUP_STORAGE_KEY)?.includes("skipped"), true);
});

test("FirstRunReaderHint dismiss persists", () => {
  localStorage.setItem(
    SETUP_STORAGE_KEY,
    JSON.stringify({ version: 1, status: "done", hintDismissed: false })
  );
  render(React.createElement(FirstRunReaderHint, { visible: true, onDismiss: () => dismissFirstRunHint() }));
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  assert.equal(JSON.parse(localStorage.getItem(SETUP_STORAGE_KEY) ?? "{}").hintDismissed, true);
});