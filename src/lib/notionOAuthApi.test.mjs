import assert from "node:assert/strict";
import test from "node:test";

import { handleNotionOAuthCallback, handleNotionOAuthStart } from "./notionOAuthApi.ts";
import { signOAuthState } from "./oauthState.server.ts";

const SECRET = "test-oauth-state-secret";
const CLIENT_ID = "client-1";
const CLIENT_SECRET = "client-secret-1";
const REDIRECT_URI = "https://coeus.test/api/archive/destinations/notion/oauth/callback";

class MemoryDestinationsStore {
  connectCalls = [];
  async connect(ownerId, kind, displayName, config, secret) {
    this.connectCalls.push({ ownerId, kind, displayName, config, secret });
    return { id: "dest-notion", archiveId: "archive-1", kind, status: "active", displayName, config, createdAt: "", updatedAt: "" };
  }
}

class MemoryOAuthStateStore {
  states = new Map();
  async create(nonce, ownerId, expiresAt) { this.states.set(nonce, { ownerId, expiresAt }); }
  async consume(nonce, ownerId) {
    const state = this.states.get(nonce);
    if (!state || state.ownerId !== ownerId || state.expiresAt <= new Date()) return false;
    this.states.delete(nonce);
    return true;
  }
}

function jsonResponse(body, status = 200) { return new Response(JSON.stringify(body), { status }); }
function locationOf(response) { return new URL(response.headers.get("location")); }
function stateStoreFor(ownerId = "user-1", nonce = "n", expiresAt = new Date(Date.now() + 60_000)) {
  const stateStore = new MemoryOAuthStateStore();
  stateStore.states.set(nonce, { ownerId, expiresAt });
  return stateStore;
}
function dependencies(store, stateStore = stateStoreFor(), authenticate = async () => "user-1") {
  return { stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store, stateStore, authenticate };
}
function callbackRequest(ownerId = "user-1", nonce = "n") {
  const state = signOAuthState({ ownerId, nonce, issuedAt: Date.now() }, SECRET);
  return new Request(`https://coeus.test/callback?code=abc&state=${encodeURIComponent(state)}`);
}

test("start requires auth and persists a signed state", async () => {
  const unauthorized = await handleNotionOAuthStart({ authenticate: async () => null, stateSecret: SECRET, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, stateStore: new MemoryOAuthStateStore() });
  assert.equal(unauthorized.status, 401);
  const stateStore = new MemoryOAuthStateStore();
  const response = await handleNotionOAuthStart({ authenticate: async () => "user-1", stateSecret: SECRET, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, stateStore });
  assert.equal(response.status, 302);
  assert.equal(locationOf(response).origin + locationOf(response).pathname, "https://api.notion.com/v1/oauth/authorize");
  assert.equal(stateStore.states.size, 1);
});

test("denial without state remains a user-friendly redirect", async () => {
  const store = new MemoryDestinationsStore();
  const response = await handleNotionOAuthCallback(new Request("https://coeus.test/callback?error=access_denied"), dependencies(store));
  assert.equal(locationOf(response).searchParams.get("status"), "error");
  assert.equal(store.connectCalls.length, 0);
});

test("callback rejects missing and mismatched sessions before token exchange", async () => {
  const store = new MemoryDestinationsStore();
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    return String(url).includes("/oauth/token")
      ? jsonResponse({ access_token: "secret-token" })
      : jsonResponse({ results: [{ id: "db-1" }] });
  };
  const missing = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store, stateStoreFor(), async () => null), fetcher });
  const mismatched = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store, stateStoreFor(), async () => "user-2"), fetcher });
  assert.equal(locationOf(missing).searchParams.get("status"), "error");
  assert.equal(locationOf(mismatched).searchParams.get("status"), "error");
  assert.equal(calls, 0);
});

test("only an unexpired, unconsumed state reaches token exchange", async () => {
  const store = new MemoryDestinationsStore();
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    return String(url).includes("/oauth/token")
      ? jsonResponse({ access_token: "secret-token" })
      : jsonResponse({ results: [{ id: "db-1" }] });
  };
  const expired = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store, stateStoreFor("user-1", "n", new Date(Date.now() - 1))), fetcher });
  const stateStore = stateStoreFor();
  const first = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store, stateStore), fetcher });
  const replay = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store, stateStore), fetcher });
  assert.equal(locationOf(expired).searchParams.get("status"), "error");
  assert.equal(locationOf(first).searchParams.get("status"), "connected");
  assert.equal(locationOf(replay).searchParams.get("status"), "error");
  assert.equal(calls, 2);
});

test("callback exchanges one valid state and connects the selected database", async () => {
  const store = new MemoryDestinationsStore();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/oauth/token")) return jsonResponse({ access_token: "secret-token", workspace_name: "Acme" });
    return jsonResponse({ results: [{ id: "db-1" }] });
  };
  const response = await handleNotionOAuthCallback(callbackRequest(), { ...dependencies(store), fetcher });
  assert.equal(calls.length, 2);
  assert.equal(locationOf(response).searchParams.get("status"), "connected");
  assert.deepEqual(store.connectCalls, [{ ownerId: "user-1", kind: "notion", displayName: "Notion — Acme", config: { databaseId: "db-1", workspaceName: "Acme" }, secret: "secret-token" }]);
});
