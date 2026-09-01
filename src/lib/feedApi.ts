import { parseFeedQuery } from "./feedContract.ts";
import { getSource } from "./sources.ts";
import type { SourceFeed } from "./types";
import type { BudgetDecision } from "./fixedWindowBudget";

export const FEED_RESPONSE_CACHE_CONTROL =
  "public, max-age=30, s-maxage=90, stale-while-revalidate=300";
export const FEED_NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";

interface FeedResult {
  sources: SourceFeed[];
  updatedAt: string;
  cache: { hits: number; misses: number; revalidating: number };
}

export interface FeedApiDependencies {
  fetchFeeds(options: {
    sourceIds: string[];
    limit: number;
    hours: number;
    forceRefresh?: boolean;
  }): Promise<FeedResult>;
  consumeRefreshBudget(request: Request, sourceCount: number): BudgetDecision;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": FEED_NO_STORE_CACHE_CONTROL, ...headers },
  });
}

export function createFeedGetHandler(dependencies: FeedApiDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const parsed = parseFeedQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const query = parsed.value;
    const sourceIds = query.topic === "all"
      ? query.sourceIds
      : query.sourceIds.filter((id) => getSource(id)?.topic === query.topic);

    let budget: BudgetDecision | null = null;
    if (query.forceRefresh) {
      budget = dependencies.consumeRefreshBudget(request, sourceIds.length || 1);
      if (!budget.allowed) {
        return json(
          { error: "Forced refresh rate limit exceeded. Try again shortly." },
          429,
          {
            "Retry-After": String(budget.retryAfterSeconds),
            "X-RateLimit-Remaining": String(budget.remaining),
          }
        );
      }
    }

    const started = performance.now();
    try {
      const data = await dependencies.fetchFeeds({
        sourceIds,
        limit: query.limit,
        hours: query.hours,
        forceRefresh: query.forceRefresh,
      });
      const ms = Math.round(performance.now() - started);
      const cacheControl = query.forceRefresh
        ? FEED_NO_STORE_CACHE_CONTROL
        : FEED_RESPONSE_CACHE_CONTROL;
      return Response.json(
        {
          sources: data.sources,
          updatedAt: data.updatedAt,
          limit: query.limit,
          hours: query.hours,
          topic: query.topic,
          meta: { ms, cache: data.cache, forceRefresh: query.forceRefresh },
        },
        {
          headers: {
            "Cache-Control": cacheControl,
            "Server-Timing": `feeds;dur=${ms}`,
            "X-Feed-Cache": `hits=${data.cache.hits};misses=${data.cache.misses};revalidating=${data.cache.revalidating}`,
            ...(budget ? { "X-RateLimit-Remaining": String(budget.remaining) } : {}),
          },
        }
      );
    } catch {
      return json({ error: "The feed service is temporarily unavailable." }, 502);
    }
  };
}
