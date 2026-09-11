import type { ArchiveItem } from "./archiveTypes.ts";
import type { DestinationAdapter, DestinationPushResult } from "./destinationAdapter.ts";
import type { NotionConfig } from "./destinations.ts";
import { fetchWithRetry, type RetryOptions } from "./httpRetry.ts";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function titleProperty(item: ArchiveItem) {
  return { Name: { title: [{ text: { content: item.title.slice(0, 2000) } }] } };
}

function paragraphPayload(item: ArchiveItem) {
  const text = [item.summary, item.note].filter(Boolean).join("\n\n") || item.url;
  return {
    rich_text: [{ type: "text" as const, text: { content: text.slice(0, 2000), link: { url: item.url } } }],
  };
}

function bodyBlocks(item: ArchiveItem) {
  return [{ object: "block" as const, type: "paragraph" as const, paragraph: paragraphPayload(item) }];
}

async function mappedFailure(response: Response): Promise<DestinationPushResult | null> {
  if (response.ok) return null;
  if (response.status === 401 || response.status === 403) {
    return { ok: false, httpStatus: response.status, authError: true, error: "Notion authentication failed" };
  }
  if (response.status === 429) {
    return { ok: false, httpStatus: 429, error: "Notion rate limit exceeded" };
  }
  let error = `Notion request failed with status ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) error = body.message;
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  return { ok: false, httpStatus: response.status, error };
}

/**
 * Notion has no hard delete: pushDelete archives the page (archived: true)
 * rather than removing it, matching Notion's own trash semantics. A 401
 * here (expired/revoked OAuth token) must never be silently retried — the
 * caller flips the destination to auth_error, distinct from a transient
 * failed_retryable error.
 */
export class NotionAdapter implements DestinationAdapter {
  private readonly config: NotionConfig;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly retryOptions: RetryOptions;

  constructor(config: NotionConfig, token: string, fetcher: typeof fetch = fetch, retryOptions: RetryOptions = {}) {
    this.config = config;
    this.token = token;
    this.fetcher = fetcher;
    this.retryOptions = retryOptions;
  }

  private request(url: string, init: RequestInit): Promise<Response> {
    return fetchWithRetry(this.fetcher, url, init, this.retryOptions);
  }

  async pushUpsert(item: ArchiveItem, existingExternalRef: string | null): Promise<DestinationPushResult> {
    if (!existingExternalRef) {
      const response = await this.request(`${NOTION_API}/pages`, {
        method: "POST",
        headers: notionHeaders(this.token),
        body: JSON.stringify({
          parent: { database_id: this.config.databaseId },
          properties: titleProperty(item),
          children: bodyBlocks(item),
        }),
      });
      const failure = await mappedFailure(response);
      if (failure) return failure;
      const body = (await response.json()) as { id: string };
      return { ok: true, externalRef: body.id, httpStatus: response.status };
    }

    const response = await this.request(`${NOTION_API}/pages/${existingExternalRef}`, {
      method: "PATCH",
      headers: notionHeaders(this.token),
      body: JSON.stringify({ properties: titleProperty(item) }),
    });
    const titleFailure = await mappedFailure(response);
    if (titleFailure) return titleFailure;

    // PATCH /pages updates properties only — children sent there are ignored.
    // Rewrite the first paragraph (the block we created) or append one.
    const bodyFailure = await this.replaceBody(existingExternalRef, item);
    if (bodyFailure) return bodyFailure;
    return { ok: true, externalRef: existingExternalRef, httpStatus: response.status };
  }

  private async replaceBody(pageId: string, item: ArchiveItem): Promise<DestinationPushResult | null> {
    const listed = await this.request(`${NOTION_API}/blocks/${pageId}/children?page_size=1`, {
      method: "GET",
      headers: notionHeaders(this.token),
    });
    const listFailure = await mappedFailure(listed);
    if (listFailure) return listFailure;
    const list = (await listed.json()) as { results?: { id: string; type: string }[] };
    const first = list.results?.[0];

    if (first?.type === "paragraph") {
      const updated = await this.request(`${NOTION_API}/blocks/${first.id}`, {
        method: "PATCH",
        headers: notionHeaders(this.token),
        body: JSON.stringify({ paragraph: paragraphPayload(item) }),
      });
      return mappedFailure(updated);
    }

    const appended = await this.request(`${NOTION_API}/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: notionHeaders(this.token),
      body: JSON.stringify({ children: bodyBlocks(item) }),
    });
    return mappedFailure(appended);
  }

  async pushDelete(_itemId: string, existingExternalRef: string): Promise<DestinationPushResult> {
    const response = await this.request(`${NOTION_API}/pages/${existingExternalRef}`, {
      method: "PATCH",
      headers: notionHeaders(this.token),
      body: JSON.stringify({ archived: true }),
    });
    const failure = await mappedFailure(response);
    if (failure) return failure;
    return { ok: true, httpStatus: response.status };
  }
}
