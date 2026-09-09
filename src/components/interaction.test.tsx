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
const { ArticlePreview, ArticlePreviewChoice } = await import("./ArticlePreview");
const { AlreadyArchivedButton, PreviewFollowButton } = await import("./DiscoverPreviewControls");
const { SourcesCategoryHub } = await import("./DiscoverSourcesApp");
const { DestinationsPanel } = await import("./DestinationsPanel");
const { AuthProvider } = await import("./AuthProvider");
const { SignInPanel } = await import("./SignInPanel");
const { WelcomeForm } = await import("./WelcomeForm");
const { AccountMenu } = await import("./AccountMenu");
const { ProfileFollowButton } = await import("./ProfileFollowButton");
const { SectionSwitches } = await import("./SectionSwitches");
const { ChromeProvider, useChrome } = await import("./ChromeProvider");
const { AppRouterContext } = await import(
  "next/dist/shared/lib/app-router-context.shared-runtime"
);
const { PathnameContext } = await import(
  "next/dist/shared/lib/hooks-client-context.shared-runtime"
);
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

test("article preview lets a reader choose the familiar external-link behavior", (context) => {
  const preview = context.mock.fn();
  const external = context.mock.fn();
  render(<ArticlePreviewChoice article={article} sourceName="Example" onClose={() => undefined} onChoosePreview={preview} onChooseExternal={external} />);
  assert.ok(screen.getByRole("dialog", { name: /Preview.*Coeus/i }));
  fireEvent.click(screen.getByRole("button", { name: "Always open original ↗" }));
  assert.equal(external.mock.callCount(), 1);
  assert.equal(preview.mock.callCount(), 0);
});

test("article preview retains a clear original-source exit and preference switch", (context) => {
  const original = context.mock.fn();
  const external = context.mock.fn();
  render(<ArticlePreview article={article} sourceName="Example" onClose={() => undefined} onOpenOriginal={original} onPreferExternal={external} />);
  assert.ok(screen.getByTitle("Preview of A durable link"));
  fireEvent.click(screen.getByRole("button", { name: /Read at example.com/ }));
  fireEvent.click(screen.getByRole("button", { name: "Always open originals" }));
  assert.equal(original.mock.callCount(), 1);
  assert.equal(external.mock.callCount(), 1);
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

// —— Auth: sign-in + onboarding ——————————————————————————————————————————

type OAuthCall = { provider: string; options?: { redirectTo?: string } };
type FakeSession = { user: { id: string; email: string | null; user_metadata?: Record<string, unknown> } } | null;

/** In-memory stand-in for the slice of the Supabase client AuthProvider touches. */
function fakeAuthClient(session: FakeSession, oauthCalls: OAuthCall[] = [], signOutCalls: number[] = []) {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithOAuth: async (options: OAuthCall) => {
        oauthCalls.push(options);
        return { error: null };
      },
      signOut: async () => {
        signOutCalls.push(1);
        return { error: null };
      },
    },
  };
}

function renderWithRouter(ui: React.ReactElement, pathname = "/archive") {
  const router = {
    push: test.mock.fn(),
    replace: test.mock.fn(),
    refresh: test.mock.fn(),
    back: test.mock.fn(),
    forward: test.mock.fn(),
    prefetch: test.mock.fn(),
  };
  const view = render(
    <AppRouterContext.Provider value={router as never}>
      <PathnameContext.Provider value={pathname}>{ui}</PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  return { router, ...view };
}

/** Routes every fetch call to `handler(url, method)`. */
function stubFetch(handler: (url: string, method: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, (init?.method ?? "GET").toUpperCase());
  }) as typeof fetch;
}

test("Sign-in panel hands each provider button off to Supabase OAuth with a callback redirect", async () => {
  const calls: OAuthCall[] = [];
  render(
    <AuthProvider client={fakeAuthClient(null, calls) as never}>
      <SignInPanel next="/archive" />
    </AuthProvider>,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Continue with GitHub" }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0].provider, "github");
  assert.match(calls[0].options?.redirectTo ?? "", /\/auth\/callback\?next=%2Farchive$/);
});

test("Sign-in panel is inert when no auth client can be constructed", async () => {
  // AuthProvider builds a real browser client when NEXT_PUBLIC_SUPABASE_* are
  // present; clear them so this test is deterministic regardless of the
  // ambient environment (a dev shell, or CI's build-step placeholders).
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    render(
      <AuthProvider>
        <SignInPanel />
      </AuthProvider>,
    );
    const github = await screen.findByRole("button", { name: "Continue with GitHub" });
    assert.equal(github.hasAttribute("disabled"), true);
    assert.ok(screen.getByText(/isn’t configured in this environment/));
  } finally {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = saved.key;
    if (saved.anon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
  }
});

test("Welcome form shows the onboarding form for a signed-in account with no profile", async () => {
  stubFetch((url, method) =>
    url.endsWith("/api/account/profile") && method === "GET"
      ? new Response(JSON.stringify({ profile: null }), { status: 200 })
      : new Response(null, { status: 404 }),
  );
  renderWithRouter(
    <AuthProvider client={fakeAuthClient({ user: { id: "u1", email: "ada@example.com" } }) as never}>
      <WelcomeForm next="/archive" />
    </AuthProvider>,
  );
  assert.ok(await screen.findByRole("heading", { name: "Choose your handle" }));
});

test("Welcome form blocks an invalid handle before it reaches the API", async () => {
  let puts = 0;
  stubFetch((url, method) => {
    if (url.endsWith("/api/account/profile") && method === "PUT") puts += 1;
    return new Response(JSON.stringify({ profile: null }), { status: 200 });
  });
  renderWithRouter(
    <AuthProvider client={fakeAuthClient({ user: { id: "u1", email: null } }) as never}>
      <WelcomeForm />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "no" } });
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  assert.ok(await screen.findByText(/and underscores only/));
  assert.equal(puts, 0);
});

test("Welcome form surfaces a taken handle returned by the API as a field error", async () => {
  stubFetch((url, method) => {
    if (method === "PUT") {
      return new Response(JSON.stringify({ error: "That handle is already taken.", field: "handle" }), { status: 409 });
    }
    return new Response(JSON.stringify({ profile: null }), { status: 200 });
  });
  renderWithRouter(
    <AuthProvider client={fakeAuthClient({ user: { id: "u1", email: null } }) as never}>
      <WelcomeForm />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "taken" } });
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada Impostor" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  assert.ok(await screen.findByText("That handle is already taken."));
});

test("Welcome form applies the saved profile and routes onward", async () => {
  const saved = { id: "u1", handle: "ada", displayName: "Ada", bio: null, createdAt: "t", updatedAt: "t" };
  stubFetch((_url, method) =>
    method === "PUT"
      ? new Response(JSON.stringify({ profile: saved }), { status: 200 })
      : new Response(JSON.stringify({ profile: null }), { status: 200 }),
  );
  const { router } = renderWithRouter(
    <AuthProvider client={fakeAuthClient({ user: { id: "u1", email: null } }) as never}>
      <WelcomeForm next="/archive" />
    </AuthProvider>,
  );
  fireEvent.change(await screen.findByLabelText("Handle"), { target: { value: "ada" } });
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ada" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => assert.equal(router.replace.mock.calls.at(-1)?.arguments[0], "/archive"));
});

// —— Header account menu ————————————————————————————————————————————————

function ChromeProbe() {
  const { settingsOpen } = useChrome();
  return <span data-testid="settings-open">{String(settingsOpen)}</span>;
}

function renderAccountMenu(session: FakeSession, profile: unknown, signOutCalls: number[] = []) {
  stubFetch((url) =>
    url.endsWith("/api/account/profile")
      ? new Response(JSON.stringify({ profile }), { status: 200 })
      : new Response(null, { status: 204 }),
  );
  return renderWithRouter(
    <AuthProvider client={fakeAuthClient(session, [], signOutCalls) as never}>
      <ChromeProvider>
        <ChromeProbe />
        <AccountMenu />
      </ChromeProvider>
    </AuthProvider>,
  );
}

test("Account menu shows a Log in link with the return path when signed out", async () => {
  renderAccountMenu(null, null);
  const link = await screen.findByRole("link", { name: "Log in" });
  assert.equal(link.getAttribute("href"), "/signin?next=%2Farchive");
});

test("Account menu shows the handle and opens Settings / Edit profile / Sign out", async () => {
  const profile = { id: "u1", handle: "theman", displayName: "bareaga", bio: "Traveller", createdAt: "t", updatedAt: "t" };
  const signOutCalls: number[] = [];
  const { router } = renderAccountMenu({ user: { id: "u1", email: "u1@example.com" } }, profile, signOutCalls);

  const trigger = await screen.findByRole("button", { name: /@theman/ });
  assert.equal(screen.queryByRole("menu"), null);

  fireEvent.click(trigger);
  const menu = await screen.findByRole("menu", { name: "Account" });
  assert.ok(menu);
  assert.ok(screen.getByRole("menuitem", { name: "Edit profile" }));
  assert.ok(screen.getByRole("menuitem", { name: "View profile" }));
  assert.ok(screen.getByRole("menuitem", { name: "Settings" }));

  // Both profile items route to /@handle (Edit just opens the inline editor).
  fireEvent.click(screen.getByRole("menuitem", { name: "View profile" }));
  assert.equal(router.push.mock.calls.at(-1)?.arguments[0], "/@theman");
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit profile" }));
  assert.equal(router.push.mock.calls.at(-1)?.arguments[0], "/@theman?edit=1");

  fireEvent.click(trigger);
  await screen.findByRole("menu", { name: "Account" });

  fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
  assert.equal(screen.getByTestId("settings-open").textContent, "true");
  assert.equal(screen.queryByRole("menu"), null); // menu closes on selection

  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => assert.equal(signOutCalls.length, 1));
});

test("Account menu prompts an onboarding-incomplete account to finish its profile", async () => {
  renderAccountMenu({ user: { id: "u1", email: "u1@example.com", user_metadata: { user_name: "octocat" } } }, null);
  const trigger = await screen.findByRole("button", { name: /octocat/ });
  fireEvent.click(trigger);
  assert.ok(await screen.findByRole("menuitem", { name: "Finish your profile" }));
});

// ── ProfileFollowButton ────────────────────────────────────────────────────

test("Profile follow button paints its initial state from props with no fetch on mount", async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls += 1; return new Response(null, { status: 204 }); }) as typeof fetch;

  render(<ProfileFollowButton profileId="p1" handle="ada" initialFollowing />);
  const button = screen.getByRole("button", { name: "Following ✓" });
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(fetchCalls, 0);

  fireEvent.click(button);
  await waitFor(() => assert.equal(screen.getByRole("button").getAttribute("aria-pressed"), "false"));
  assert.equal(fetchCalls, 1);
});

test("Profile follow button shows a sign-in prompt on a 401, linking back to the profile", async () => {
  stubFetch(() => new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }));
  render(<ProfileFollowButton profileId="p1" handle="ada" initialFollowing={false} />);

  fireEvent.click(screen.getByRole("button", { name: "Follow" }));
  const link = await screen.findByRole("link", { name: "Sign in" });
  assert.equal(link.getAttribute("href"), "/signin?next=%2F%40ada");
  // The follow state did not flip.
  assert.equal(screen.getByRole("button").getAttribute("aria-pressed"), "false");
});

// ── SectionSwitches ────────────────────────────────────────────────────────

const SECTIONS_ALL_ON = {
  showFollowers: true,
  showFollowing: true,
  showReposts: true,
  showReplies: true,
  showLikes: true,
  likesVisibility: "public" as const,
};

test("Section switches are not rendered for a visitor", () => {
  const { container } = render(<SectionSwitches isOwner={false} initial={SECTIONS_ALL_ON} />);
  assert.equal(container.innerHTML, "");
});

test("Section switches toggle optimistically and roll back only the failed one", async () => {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    bodies.push(body);
    // Fail the Replies toggle only; succeed everything else.
    return new Response(null, { status: "showReplies" in body ? 503 : 204 });
  }) as typeof fetch;

  render(<SectionSwitches isOwner initial={SECTIONS_ALL_ON} />);
  const reposts = screen.getByRole("switch", { name: "Reposts" });
  const replies = screen.getByRole("switch", { name: "Replies" });

  fireEvent.click(reposts); // succeeds → stays off
  fireEvent.click(replies); // fails → rolls back on

  await waitFor(() => assert.equal(replies.getAttribute("aria-checked"), "true"));
  assert.equal(reposts.getAttribute("aria-checked"), "false");
  assert.ok(screen.getByRole("status").textContent?.includes("Couldn’t save"));
  assert.deepEqual(bodies, [{ showReposts: false }, { showReplies: false }]);
});

test("Section switches PATCH just the one changed field", async () => {
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  render(<SectionSwitches isOwner initial={SECTIONS_ALL_ON} />);
  fireEvent.click(screen.getByRole("switch", { name: "Likes" }));
  await waitFor(() => assert.equal(bodies.length, 1));
  assert.deepEqual(JSON.parse(bodies[0]), { showLikes: false });
});
