import { createOAuthStateNonce, signOAuthState, verifyOAuthState } from "./oauthState.server.ts";
import type { DestinationsStore } from "./destinationsStore.server.ts";

export interface NotionOAuthStartDependencies {
  authenticate(): Promise<string | null>;
  stateSecret: string;
  clientId: string;
  redirectUri: string;
}

export interface NotionOAuthCallbackDependencies {
  stateSecret: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  store: DestinationsStore;
  fetcher?: typeof fetch;
}

function settingsRedirect(baseUrl: string, params: Record<string, string>): Response {
  const url = new URL("/archive", baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString(), 302);
}

/**
 * Starts the Notion OAuth flow. The signed `state` reuses OAuthStatePayload's
 * `archiveId` field to carry the caller's owner id (there is a 1:1 owner:archive
 * relationship, and oauthState.server.ts already shipped with that field name).
 */
export async function handleNotionOAuthStart(dependencies: NotionOAuthStartDependencies): Promise<Response> {
  const ownerId = await dependencies.authenticate();
  if (!ownerId) return new Response("Authentication required", { status: 401 });

  const state = signOAuthState(
    { archiveId: ownerId, nonce: createOAuthStateNonce(), issuedAt: Date.now() },
    dependencies.stateSecret
  );
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

  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirectError(`Notion authorization was denied (${oauthError})`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectError("Notion did not return a code");

  const verified = verifyOAuthState(state, dependencies.stateSecret);
  if (!verified.ok) return redirectError(verified.error);
  const ownerId = verified.value.archiveId;

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
