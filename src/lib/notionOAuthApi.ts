import { createOAuthStateNonce, OAUTH_STATE_MAX_AGE_MS, signOAuthState, verifyOAuthState } from "./oauthState.server.ts";
import type { DestinationsStore } from "./destinationsStore.server.ts";
import type { NotionOAuthStateStore } from "./notionOAuthStateStore.server.ts";

export interface NotionOAuthStartDependencies {
  authenticate(): Promise<string | null>;
  stateSecret: string;
  clientId: string;
  redirectUri: string;
  stateStore: NotionOAuthStateStore;
}

export interface NotionOAuthCallbackDependencies {
  authenticate(): Promise<string | null>;
  stateSecret: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  store: DestinationsStore;
  stateStore: NotionOAuthStateStore;
  fetcher?: typeof fetch;
}

function settingsRedirect(baseUrl: string, params: Record<string, string>): Response {
  const url = new URL("/archive", baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString(), 302);
}

/**
 * Starts the Notion OAuth flow with its owner id and a persisted nonce. The
 * callback consumes that nonce before code exchange, making each attempt
 * single-use.
 */
export async function handleNotionOAuthStart(dependencies: NotionOAuthStartDependencies): Promise<Response> {
  const ownerId = await dependencies.authenticate();
  if (!ownerId) return new Response("Authentication required", { status: 401 });

  const issuedAt = Date.now();
  const nonce = createOAuthStateNonce();
  await dependencies.stateStore.create(nonce, ownerId, new Date(issuedAt + OAUTH_STATE_MAX_AGE_MS));
  const state = signOAuthState({ ownerId, nonce, issuedAt }, dependencies.stateSecret);
  const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", dependencies.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("owner", "user");
  authorizeUrl.searchParams.set("redirect_uri", dependencies.redirectUri);
  authorizeUrl.searchParams.set("state", state);
  return Response.redirect(authorizeUrl.toString(), 302);
}

interface NotionTokenResponse {
  access_token: string;
  workspace_name?: string;
}

interface NotionSearchResponse {
  results: { id: string }[];
}

/**
 * Completes the Notion OAuth flow: exchanges the code, then picks the first
 * database the user shared with the integration during the OAuth consent
 * screen (Notion has no "pick a database" OAuth scope, so this is the
 * simplest way to land on a usable databaseId without a second UI step).
 */
export async function handleNotionOAuthCallback(request: Request, dependencies: NotionOAuthCallbackDependencies): Promise<Response> {
  const fetcher = dependencies.fetcher ?? fetch;
  const url = new URL(request.url);
  const redirectError = (message: string) => settingsRedirect(request.url, { destination: "notion", status: "error", message });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (!state) return redirectError(oauthError ? `Notion authorization was denied (${oauthError})` : "Notion did not return a code");

  const verified = verifyOAuthState(state, dependencies.stateSecret);
  if (!verified.ok) return redirectError(verified.error);
  const ownerId = verified.value.ownerId;
  const currentUserId = await dependencies.authenticate();
  if (!currentUserId) return redirectError("Please sign in again to complete the Notion connection");
  if (currentUserId !== ownerId) return redirectError("This Notion connection belongs to a different account");
  if (!(await dependencies.stateStore.consume(verified.value.nonce, ownerId))) {
    return redirectError("This Notion connection has expired or was already used");
  }
  if (oauthError) return redirectError(`Notion authorization was denied (${oauthError})`);
  if (!code) return redirectError("Notion did not return a code");

  const tokenResponse = await fetcher("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${dependencies.clientId}:${dependencies.clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: dependencies.redirectUri }),
  });
  if (!tokenResponse.ok) return redirectError("Notion token exchange failed");
  const token = (await tokenResponse.json()) as NotionTokenResponse;

  const searchResponse = await fetcher("https://api.notion.com/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { property: "object", value: "database" }, page_size: 1 }),
  });
  if (!searchResponse.ok) return redirectError("Could not list Notion databases");
  const search = (await searchResponse.json()) as NotionSearchResponse;
  const databaseId = search.results[0]?.id;
  if (!databaseId) return redirectError("Share at least one database with the integration in Notion, then reconnect");

  try {
    await dependencies.store.connect(
      ownerId,
      "notion",
      token.workspace_name ? `Notion — ${token.workspace_name}` : "Notion",
      { databaseId, workspaceName: token.workspace_name ?? "" },
      token.access_token
    );
  } catch {
    return redirectError("Saving the Notion connection failed");
  }
  return settingsRedirect(request.url, { destination: "notion", status: "connected" });
}
