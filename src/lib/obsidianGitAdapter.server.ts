import type { ObsidianGitConfig } from "./destinations.ts";
import type { DestinationPushResult } from "./destinationAdapter.ts";
import { fetchWithRetry, type RetryOptions } from "./httpRetry.ts";

export interface GitBatchAction {
  itemId: string;
  kind: "upsert" | "delete";
  /** Repo-relative file path; also the adapter's externalRef, since Git Data API upserts key on path, not a blob sha. */
  path: string;
  /** Required for "upsert"; ignored for "delete". */
  content?: string;
}

interface GitHubTreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  content?: string;
  sha?: null;
}

const GITHUB_API = "https://api.github.com";

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function failAll(actions: GitBatchAction[], result: DestinationPushResult): Map<string, DestinationPushResult> {
  return new Map(actions.map((action) => [action.itemId, result]));
}

/**
 * Pushes an obsidian_git destination via the GitHub Git Data API. All dirty
 * items in a worker tick share one tree + one commit + one ref update: no
 * per-file blob calls, and no partial success — either the whole batch lands
 * in a single commit, or none of it does and every item is retried next tick.
 */
export class GitHubGitAdapter {
  private readonly config: ObsidianGitConfig;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly retryOptions: RetryOptions;

  constructor(config: ObsidianGitConfig, token: string, fetcher: typeof fetch = fetch, retryOptions: RetryOptions = {}) {
    this.config = config;
    this.token = token;
    this.fetcher = fetcher;
    this.retryOptions = retryOptions;
  }

  private request(url: string, init: RequestInit): Promise<Response> {
    return fetchWithRetry(this.fetcher, url, init, this.retryOptions);
  }

  path(itemId: string): string {
    const prefix = this.config.pathPrefix ? `${this.config.pathPrefix}/` : "";
    return `${prefix}${itemId}.md`;
  }

  async pushBatch(actions: GitBatchAction[]): Promise<Map<string, DestinationPushResult>> {
    if (!actions.length) return new Map();

    const refResponse = await this.request(
      `${GITHUB_API}/repos/${this.config.repo}/git/ref/heads/${encodeURIComponent(this.config.branch)}`,
      { headers: githubHeaders(this.token) }
    );
    const refFailure = await this.mappedFailure(refResponse, actions);
    if (refFailure) return refFailure;
    const refBody = (await refResponse.json()) as { object: { sha: string } };
    const parentCommitSha = refBody.object.sha;

    const commitResponse = await this.request(
      `${GITHUB_API}/repos/${this.config.repo}/git/commits/${parentCommitSha}`,
      { headers: githubHeaders(this.token) }
    );
    const commitFailure = await this.mappedFailure(commitResponse, actions);
    if (commitFailure) return commitFailure;
    const commitBody = (await commitResponse.json()) as { tree: { sha: string } };

    const tree: GitHubTreeEntry[] = actions.map((action) =>
      action.kind === "upsert"
        ? { path: action.path, mode: "100644", type: "blob", content: action.content ?? "" }
        : { path: action.path, mode: "100644", type: "blob", sha: null }
    );
    const treeResponse = await this.request(`${GITHUB_API}/repos/${this.config.repo}/git/trees`, {
      method: "POST",
      headers: githubHeaders(this.token),
      body: JSON.stringify({ base_tree: commitBody.tree.sha, tree }),
    });
    const treeFailure = await this.mappedFailure(treeResponse, actions);
    if (treeFailure) return treeFailure;
    const treeBody = (await treeResponse.json()) as { sha: string };

    const newCommitResponse = await this.request(`${GITHUB_API}/repos/${this.config.repo}/git/commits`, {
      method: "POST",
      headers: githubHeaders(this.token),
      body: JSON.stringify({
        message: `Coeus sync: ${actions.length} item${actions.length === 1 ? "" : "s"}`,
        tree: treeBody.sha,
        parents: [parentCommitSha],
      }),
    });
    const newCommitFailure = await this.mappedFailure(newCommitResponse, actions);
    if (newCommitFailure) return newCommitFailure;
    const newCommitBody = (await newCommitResponse.json()) as { sha: string };

    const updateRefResponse = await this.request(
      `${GITHUB_API}/repos/${this.config.repo}/git/refs/heads/${encodeURIComponent(this.config.branch)}`,
      { method: "PATCH", headers: githubHeaders(this.token), body: JSON.stringify({ sha: newCommitBody.sha }) }
    );
    const updateRefFailure = await this.mappedFailure(updateRefResponse, actions);
    if (updateRefFailure) return updateRefFailure;

    return new Map(
      actions.map((action) => [
        action.itemId,
        action.kind === "upsert"
          ? { ok: true, externalRef: action.path, httpStatus: updateRefResponse.status }
          : { ok: true, httpStatus: updateRefResponse.status },
      ])
    );
  }

  private async mappedFailure(
    response: Response,
    actions: GitBatchAction[]
  ): Promise<Map<string, DestinationPushResult> | null> {
    if (response.ok) return null;
    if (response.status === 401 || response.status === 403) {
      return failAll(actions, { ok: false, httpStatus: response.status, authError: true, error: "GitHub authentication failed" });
    }
    if (response.status === 429) {
      return failAll(actions, { ok: false, httpStatus: 429, error: "GitHub rate limit exceeded" });
    }
    let error = `GitHub request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) error = body.message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    return failAll(actions, { ok: false, httpStatus: response.status, error });
  }
}
