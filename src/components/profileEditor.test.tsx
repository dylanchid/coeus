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

const React = await import("react");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { ProfileEditor } = await import("./ProfileEditor");

const inputValue = (el: HTMLElement): string => (el as HTMLInputElement | HTMLTextAreaElement).value;

function profilePut(): { method?: string; body: Record<string, unknown> } {
  const call = fetchCalls.find((entry) => entry.url === "/api/account/profile");
  assert.ok(call, "expected a PUT to /api/account/profile");
  const raw = call.init?.body;
  return { method: call.init?.method, body: typeof raw === "string" ? JSON.parse(raw) : {} };
}

interface FetchCall {
  url: unknown;
  init: RequestInit | undefined;
}
interface StubResponse {
  status: number;
  body?: unknown;
}

let fetchCalls: FetchCall[] = [];
let nextResponses: StubResponse[] = [];

globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
  fetchCalls.push({ url, init });
  const next = nextResponses.shift() ?? { status: 200, body: {} };
  return new Response(JSON.stringify(next.body ?? {}), {
    status: next.status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

afterEach(() => {
  cleanup();
  fetchCalls = [];
  nextResponses = [];
});

function baseProps(overrides = {}) {
  return {
    handle: "ada",
    displayName: "Ada Lovelace",
    bio: "Countess of computing",
    location: "London",
    links: [{ label: "Site", url: "https://ada.example" }],
    avatarUrl: null,
    coverUrl: null,
    defaultOpen: true,
    onSaved: () => {},
    ...overrides,
  };
}

test("renders with current values at first paint, no loading state", () => {
  render(<ProfileEditor {...baseProps()} />);
  assert.equal(inputValue(screen.getByRole("textbox", { name: /bio/i })), "Countess of computing");
  assert.equal(inputValue(screen.getByRole("textbox", { name: /location/i })), "London");
  assert.equal(inputValue(screen.getByLabelText(/link 1 URL/i)), "https://ada.example");
});

test("a successful save PUTs the profile and calls onSaved without a reload", async () => {
  let saved = 0;
  nextResponses = [{ status: 200, body: { profile: {} } }];
  render(<ProfileEditor {...baseProps({ onSaved: () => { saved += 1; } })} />);

  fireEvent.change(screen.getByRole("textbox", { name: /bio/i }), { target: { value: "New bio" } });
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

  await waitFor(() => assert.equal(saved, 1));
  const put = profilePut();
  assert.equal(put.method, "PUT");
  assert.equal(put.body.bio, "New bio");
});

test("a 422 response renders each field error beside its field", async () => {
  nextResponses = [{ status: 422, body: { fields: { bio: "Bio too long.", location: "Location too long." } } }];
  render(<ProfileEditor {...baseProps()} />);

  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

  await waitFor(() => {
    const errors = document.querySelectorAll(".profile-editor-error");
    assert.equal(errors.length, 2);
  });
  assert.ok(screen.getByText("Bio too long."));
  assert.ok(screen.getByText("Location too long."));
});

test("adding a sixth link is prevented client-side", () => {
  render(<ProfileEditor {...baseProps({ links: [] })} />);
  const addButton = () => screen.queryByRole("button", { name: /add link/i });
  for (let i = 0; i < 5; i += 1) {
    const button = addButton();
    assert.ok(button, `expected the add-link button to still be present at ${i} links`);
    fireEvent.click(button);
  }
  assert.equal(addButton(), null);
  assert.equal(screen.getAllByLabelText(/link \d+ URL/i).length, 5);
});

test("choosing the generated cover clears cover_url in the PUT body", async () => {
  nextResponses = [{ status: 200, body: {} }];
  render(<ProfileEditor {...baseProps({ coverUrl: "http://localhost:54321/storage/v1/object/public/profile-media/ada/cover-x.png" })} />);

  fireEvent.click(screen.getByRole("radio", { name: /generated from your handle/i }));
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

  await waitFor(() => assert.ok(fetchCalls.find((call) => call.url === "/api/account/profile")));
  assert.equal(profilePut().body.coverUrl, null);
});
