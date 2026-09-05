import assert from "node:assert/strict";
import test from "node:test";

import { handleNotionOAuthCallback, handleNotionOAuthStart } from "./notionOAuthApi.ts";
import { signOAuthState } from "./oauthState.server.ts";

const SECRET = "test-oauth-state-secret";
const CLIENT_ID = "client-1";
const CLIENT_SECRET = "client-secret-1";
const REDIRECT_URI = "https://bareaga.test/api/archive/destinations/notion/oauth/callback";

class MemoryDestinationsStore {
  connectCalls = [];
  failNext = false;

  async connect(ownerId, kind, displayName, config, secret) {
    if (this.failNext) throw new Error("db down");
    this.connectCalls.push({ ownerId, kind, displayName, config, secret });
    return { id: "dest-notion", archiveId: "archive-1", kind, status: "active", displayName, config, createdAt: "", updatedAt: "" };
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function locationOf(response) {
  return new URL(response.headers.get("location"));
}

test("handleNotionOAuthStart requires auth and redirects to Notion's authorize endpoint with a signed state", async () => {
  const unauthorized = await handleNotionOAuthStart({
    authenticate: async () => null,
    stateSecret: SECRET,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
  });
  assert.equal(unauthorized.status, 401);

  const response = await handleNotionOAuthStart({
    authenticate: async () => "user-1",
    stateSecret: SECRET,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
  });
  assert.equal(response.status, 302);
  const location = locationOf(response);
  assert.equal(location.origin + location.pathname, "https://api.notion.com/v1/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(location.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.ok(location.searchParams.get("state"));
});

test("handleNotionOAuthCallback redirects with an error when Notion denies consent", async () => {
  const store = new MemoryDestinationsStore();
  const request = new Request("https://bareaga.test/api/archive/destinations/notion/oauth/callback?error=access_denied");
  const response = await handleNotionOAuthCallback(request, { stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store });
  assert.equal(response.status, 302);
  const location = locationOf(response);
  assert.equal(location.searchParams.get("status"), "error");
  assert.equal(store.connectCalls.length, 0);
});

test("handleNotionOAuthCallback rejects a missing or tampered state", async () => {
  const store = new MemoryDestinationsStore();

  const missingState = await handleNotionOAuthCallback(
    new Request("https://bareaga.test/callback?code=abc"),
    { stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store }
  );
  assert.equal(locationOf(missingState).searchParams.get("status"), "error");

  const badState = await handleNotionOAuthCallback(
    new Request("https://bareaga.test/callback?code=abc&state=not-a-real-token"),
    { stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store }
  );
  assert.equal(locationOf(badState).searchParams.get("status"), "error");
  assert.equal(store.connectCalls.length, 0);
});

function validCallbackRequest(ownerId = "user-1") {
  const state = signOAuthState({ archiveId: ownerId, nonce: "n", issuedAt: Date.now() }, SECRET);
  return new Request(`https://bareaga.test/callback?code=abc&state=${encodeURIComponent(state)}`);
}

test("handleNotionOAuthCallback exchanges the code, picks the first shared database, and connects the destination", async () => {
  const store = new MemoryDestinationsStore();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/oauth/token")) return jsonResponse({ access_token: "secret-token", workspace_name: "Acme" });
    if (String(url).includes("/search")) return jsonResponse({ results: [{ id: "db-1" }] });
    throw new Error(`unexpected fetch ${url}`);
  };

  const response = await handleNotionOAuthCallback(validCallbackRequest(), {
    stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store, fetcher,
  });

  assert.equal(calls.length, 2);
  assert.equal(response.status, 302);
  assert.equal(locationOf(response).searchParams.get("status"), "connected");
  assert.deepEqual(store.connectCalls, [{
    ownerId: "user-1", kind: "notion", displayName: "Notion — Acme",
    config: { databaseId: "db-1", workspaceName: "Acme" }, secret: "secret-token",
  }]);
});

test("handleNotionOAuthCallback redirects with an error when no database was shared", async () => {
  const store = new MemoryDestinationsStore();
  const fetcher = async (url) => {
    if (String(url).includes("/oauth/token")) return jsonResponse({ access_token: "secret-token" });
    return jsonResponse({ results: [] });
  };
  const response = await handleNotionOAuthCallback(validCallbackRequest(), {
    stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store, fetcher,
  });
  assert.equal(locationOf(response).searchParams.get("status"), "error");
  assert.equal(store.connectCalls.length, 0);
});

test("handleNotionOAuthCallback redirects with an error when the token exchange fails", async () => {
  const store = new MemoryDestinationsStore();
  const fetcher = async () => jsonResponse({ error: "invalid_grant" }, 400);
  const response = await handleNotionOAuthCallback(validCallbackRequest(), {
    stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store, fetcher,
  });
  assert.equal(locationOf(response).searchParams.get("status"), "error");
});

test("handleNotionOAuthCallback redirects with an error when saving the destination fails", async () => {
  const store = new MemoryDestinationsStore();
  store.failNext = true;
  const fetcher = async (url) => {
    if (String(url).includes("/oauth/token")) return jsonResponse({ access_token: "secret-token" });
    return jsonResponse({ results: [{ id: "db-1" }] });
  };
  const response = await handleNotionOAuthCallback(validCallbackRequest(), {
    stateSecret: SECRET, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: REDIRECT_URI, store, fetcher,
  });
  assert.equal(locationOf(response).searchParams.get("status"), "error");
});
