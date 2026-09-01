import { chunkIds } from "./clientCache.ts";
import { getSource, orderByIds, sourceTopic, type Topic } from "./sources.ts";
import type { SourceFeed } from "./types.ts";

export const FEED_BATCH_SIZE = 6;
export const FEED_BATCH_CONCURRENCY = 2;

export interface FeedQuery {
  ids: string[];
  order: string[];
  limit: number;
  hours: number;
}

export interface FeedBatchResponse {
  sources: SourceFeed[];
  updatedAt: string;
}

export interface FeedQueryProgress {
  sources: SourceFeed[];
  updatedAt: string | null;
  failedIds: string[];
  completedBatches: number;
  totalBatches: number;
}

export interface FeedQueryResult extends FeedQueryProgress {
  successfulBatches: number;
}

type FeedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export function friendlyFeedError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "";
  const message = error instanceof Error ? error.message : "";
  if (/network|fetch/i.test(message)) {
    return "Bareaga couldn’t reach the feed service. Check your connection and try again.";
  }
  if (/Feed API (5\d\d)/i.test(message)) {
    return "The feed service is temporarily unavailable. Try again in a moment.";
  }
  return "Bareaga couldn’t load these stories. Try again; your preferences are safe.";
}

export function visibleSourceIds(
  order: string[],
  hidden: Set<string>,
  topic: Topic
): string[] {
  return order.filter((id) => {
    if (hidden.has(id)) return false;
    return topic === "all" || sourceTopic(id) === topic;
  });
}

export function mergeSourceFeed(
  sources: SourceFeed[],
  source: SourceFeed,
  order: string[]
): SourceFeed[] {
  const byId = new Map(sources.map((item) => [item.id, item]));
  byId.set(source.id, source);
  return orderByIds([...byId.values()], order);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function failedSource(id: string, error: unknown, previous?: SourceFeed): SourceFeed {
  const definition = getSource(id);
  return {
    id,
    name: previous?.name ?? definition?.name ?? id,
    topic: previous?.topic ?? definition?.topic ?? "unknown",
    homeUrl: previous?.homeUrl ?? definition?.homeUrl,
    articles: previous?.articles ?? [],
    error: error instanceof Error ? error.message : "Feed request failed",
  };
}

export async function fetchFeedBatch(
  ids: string[],
  query: Pick<FeedQuery, "limit" | "hours">,
  options: { force: boolean; signal: AbortSignal; fetcher?: FeedFetch }
): Promise<FeedBatchResponse> {
  const fetcher = options.fetcher ?? fetch;
  const params = new URLSearchParams({
    limit: String(query.limit),
    hours: String(query.hours),
    ids: ids.join(","),
  });
  if (options.force) params.set("refresh", "1");

  const response = await fetcher(`/api/feeds?${params}`, {
    signal: options.signal,
    cache: options.force ? "no-store" : "default",
  });
  if (!response.ok) throw new Error(`Feed API ${response.status}`);
  return (await response.json()) as FeedBatchResponse;
}

/**
 * Load source batches with bounded concurrency. Every settled batch publishes a
 * complete merged snapshot, so stale cached sources remain visible while fresh
 * batches arrive and one failed request cannot stop unrelated work.
 */
export async function runFeedQuery(
  query: FeedQuery,
  options: {
    force: boolean;
    signal: AbortSignal;
    initialSources?: SourceFeed[];
    fetcher?: FeedFetch;
    batchSize?: number;
    concurrency?: number;
    onProgress?: (progress: FeedQueryProgress) => void;
  }
): Promise<FeedQueryResult> {
  const batches = chunkIds(query.ids, options.batchSize ?? FEED_BATCH_SIZE);
  const byId = new Map(
    (options.initialSources ?? []).map((source) => [source.id, source])
  );
  const failedIds = new Set<string>();
  let updatedAt: string | null = null;
  let nextBatch = 0;
  let completedBatches = 0;
  let successfulBatches = 0;

  const snapshot = (): FeedQueryProgress => ({
    sources: orderByIds([...byId.values()], query.order),
    updatedAt,
    failedIds: [...failedIds],
    completedBatches,
    totalBatches: batches.length,
  });

  const worker = async () => {
    while (true) {
      if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const batchIndex = nextBatch++;
      const ids = batches[batchIndex];
      if (!ids) return;

      try {
        const data = await fetchFeedBatch(ids, query, options);
        if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
        successfulBatches += 1;
        updatedAt = data.updatedAt || updatedAt;
        for (const source of data.sources) {
          byId.set(source.id, source);
          failedIds.delete(source.id);
        }
      } catch (error) {
        if (options.signal.aborted || isAbortError(error)) throw error;
        for (const id of ids) {
          failedIds.add(id);
          byId.set(id, failedSource(id, error, byId.get(id)));
        }
      }

      completedBatches += 1;
      options.onProgress?.(snapshot());
    }
  };

  const workerCount = Math.min(
    batches.length,
    Math.max(1, options.concurrency ?? FEED_BATCH_CONCURRENCY)
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { ...snapshot(), successfulBatches };
}
