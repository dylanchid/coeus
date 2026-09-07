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

const React = await import("react");
const { cleanup, render, screen } = await import("@testing-library/react");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
const { ProfileTabs } = await import("./ProfileTabs");
const { ProfileSidebar } = await import("./ProfileSidebar");
const { deriveProfileView, DEFAULT_SECTION_SWITCHES } = await import("@/lib/publicProfile");

const PROFILE_ID = "00000000-0000-0000-0000-000000000abc";

let fetchCalls = 0;
const noFetch = (async () => {
  fetchCalls += 1;
  return new Response(null, { status: 200 });
}) as typeof fetch;

afterEach(() => {
  cleanup();
  fetchCalls = 0;
});

function profile(overrides = {}) {
  return {
    id: PROFILE_ID,
    handle: "ada",
    displayName: "Ada Lovelace",
    bio: null,
    location: null,
    links: [],
    avatarUrl: null,
    coverUrl: null,
    pinnedCollectionSlugs: [],
    sections: DEFAULT_SECTION_SWITCHES,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderWithRouter(ui: React.ReactElement) {
  const router = {
    push: test.mock.fn(),
    replace: test.mock.fn(),
    refresh: test.mock.fn(),
    back: test.mock.fn(),
    forward: test.mock.fn(),
    prefetch: test.mock.fn(),
  };
  return render(
    <AppRouterContext.Provider value={router as never}>
      <PathnameContext.Provider value="/@ada">{ui}</PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

// ── ProfileTabs: the follow button ─────────────────────────────────────────

test("ProfileTabs renders the follow button for a signed-in non-owner, seeded and with no fetch on mount", () => {
  globalThis.fetch = noFetch;
  renderWithRouter(
    <ProfileTabs
      handle="ada"
      current="overview"
      isOwner={false}
      follow={{ profileId: PROFILE_ID, initialFollowing: true }}
    />
  );
  const button = screen.getByRole("button", { name: /following/i });
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(fetchCalls, 0);
});

test("ProfileTabs shows the owner an Edit link and no follow button", () => {
  renderWithRouter(<ProfileTabs handle="ada" current="overview" isOwner follow={null} />);
  assert.ok(screen.getByRole("link", { name: /edit profile/i }));
  assert.equal(screen.queryByRole("button", { name: /follow/i }), null);
});

test("ProfileTabs shows a logged-out visitor neither control", () => {
  renderWithRouter(<ProfileTabs handle="ada" current="overview" isOwner={false} follow={null} />);
  assert.equal(screen.queryByRole("button", { name: /follow/i }), null);
  assert.equal(screen.queryByRole("link", { name: /edit profile/i }), null);
});

// ── ProfileSidebar: section switches + person-follow figure ────────────────

test("ProfileSidebar renders SectionSwitches for the owner only", () => {
  const view = deriveProfileView(profile(), [], { kind: "owner", id: PROFILE_ID }, {
    sections: DEFAULT_SECTION_SWITCHES,
    followers: 3,
    following: 1,
  });
  const { rerender } = render(
    <ProfileSidebar view={view} sectionSwitches={DEFAULT_SECTION_SWITCHES} />
  );
  assert.ok(screen.getByRole("group", { name: /show on profile/i }));

  const visitorView = deriveProfileView(profile(), [], { kind: "anonymous" }, {
    sections: DEFAULT_SECTION_SWITCHES,
    followers: 3,
    following: 1,
  });
  rerender(<ProfileSidebar view={visitorView} sectionSwitches={null} />);
  assert.equal(screen.queryByRole("group", { name: /show on profile/i }), null);
});

test("ProfileSidebar hides the Followers figure from a visitor when the switch is off", () => {
  const sections = { ...DEFAULT_SECTION_SWITCHES, showFollowers: false };
  const view = deriveProfileView(profile({ sections }), [], { kind: "anonymous" }, {
    sections,
    followers: 9,
    following: 2,
  });
  render(<ProfileSidebar view={view} sectionSwitches={null} />);
  assert.equal(screen.queryByText("Followers"), null);
  assert.ok(screen.getByText("Following"));
});

test("ProfileSidebar shows the owner a hidden-marked Followers figure", () => {
  const sections = { ...DEFAULT_SECTION_SWITCHES, showFollowers: false };
  const view = deriveProfileView(profile({ sections }), [], { kind: "owner", id: PROFILE_ID }, {
    sections,
    followers: 9,
    following: 2,
  });
  render(<ProfileSidebar view={view} sectionSwitches={sections} />);
  assert.ok(screen.getByText(/Followers \(hidden\)/));
});

test("the derived view handed to the sidebar never serialises the profile UUID", () => {
  const view = deriveProfileView(profile(), [], { kind: "anonymous" }, {
    sections: DEFAULT_SECTION_SWITCHES,
    followers: 1,
    following: 1,
  });
  assert.equal(JSON.stringify(view).includes(PROFILE_ID), false);
});
