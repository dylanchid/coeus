import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { useState } from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const { act, cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { defaultSourceOrder } = await import("@/lib/feeds/sources");
import type { UserPrefs } from "@/lib/types";
const { collectionSourceId, buildCollectionSourceDef } = await import("@/lib/feeds/collectionSource");
const { SourcesPanel } = await import("./settings/SourcesPanel");
const { AuthProvider } = await import("./AuthProvider");

function fakeAuthClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1", email: "ada@example.com" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

function makePrefs(): UserPrefs {
  const def = buildCollectionSourceDef({ slug: "field-notes", name: "Field Notes", curatorHandle: "ada" });
  return {
    version: 1 as const,
    customSources: [def],
    sourceOrder: [...defaultSourceOrder(), collectionSourceId("field-notes")],
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

const unfollowCalls: string[] = [];
let followedFetchCount = 0;
let releaseFollowed: () => void;
let followedGate: Promise<void>;

beforeEach(() => {
  unfollowCalls.length = 0;
  followedFetchCount = 0;
  followedGate = new Promise<void>((resolve) => {
    releaseFollowed = resolve;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/account/profile")) {
      return new Response(null, { status: 404 });
    }
    if (url.includes("/api/collections/followed")) {
      followedFetchCount += 1;
      await followedGate;
      return new Response(
        JSON.stringify({ publications: [{ id: "pub-field", slug: "field-notes", name: "Field Notes", curatorHandle: "ada" }] }),
        { status: 200 },
      );
    }
    if (url.includes("/api/collections/unfollow") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { publicationId: string };
      unfollowCalls.push(body.publicationId);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
});

afterEach(() => cleanup());

function Harness() {
  const [prefs, setPrefs] = useState<UserPrefs>(makePrefs);
  return (
    <AuthProvider client={fakeAuthClient() as never}>
      <SourcesPanel prefs={prefs} onChange={(update) => setPrefs((current) => ({ ...current, ...update }))} />
    </AuthProvider>
  );
}

test("Unfollow calls the API even when followed ids hydrate after the first paint", async () => {
  render(<Harness />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const button = await screen.findByRole("button", { name: "Unfollow" });
  void act(async () => {
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseFollowed();
  });
  await waitFor(() => assert.deepEqual(unfollowCalls, ["pub-field"]));
  assert.ok(followedFetchCount >= 1, "unfollow should hydrate publication ids on demand");
});