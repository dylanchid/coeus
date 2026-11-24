import type { BudgetDecision } from "../fixedWindowBudget.ts";

export const LINK_RESOLVE_MAX_URLS = 50;
const CONCURRENCY = 4;
const PER_LINK_TIMEOUT_MS = 15_000;

export interface ResolvedLinkRow {
  url: string;
  ok: boolean;
  title: string;
  sourceName: string;
  author: string;
  excerpt: string;
}

export interface LinkResolveDependencies {
  resolveCard: (url: string) => Promise<{
    decision: { allowed: boolean };
    card?: { title: string; description: string; siteName: string; domain: string };
  }>;
  consumeBudget: (request: Request, count: number) => BudgetDecision;
  /** Returns false when the URL must not be fetched (SSRF guard). */
  isUrlAllowed: (url: string) => Promise<boolean>;
}

function rowFromFailure(url: string): ResolvedLinkRow {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    /* keep raw url */
  }
  return { url, ok: false, title: host, sourceName: host, author: "", excerpt: "" };
}

async function resolveOne(
  url: string,
  dependencies: Pick<LinkResolveDependencies, "resolveCard" | "isUrlAllowed">,
): Promise<ResolvedLinkRow> {
  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    return rowFromFailure(url);
  }
  if (!(await dependencies.isUrlAllowed(url))) {
    return rowFromFailure(url);
  }

  const result = await Promise.race([
    dependencies.resolveCard(url),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), PER_LINK_TIMEOUT_MS);
    }),
  ]).catch(() => null);

  if (!result || result.decision.allowed === false || !result.card) {
    return rowFromFailure(url);
  }

  const { card } = result;
  return {
    url,
    ok: true,
    title: card.title,
    sourceName: card.siteName || card.domain,
    author: "",
    excerpt: card.description,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

const NO_STORE = "private, no-store, max-age=0";

export function createLinkResolvePostHandler(dependencies: LinkResolveDependencies) {
  return async function POST(request: Request): Promise<Response> {
    let body: { urls?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
    }

    if (!Array.isArray(body.urls)) {
      return Response.json({ error: "Expected { urls: string[] }" }, { status: 400, headers: { "Cache-Control": NO_STORE } });
    }

    const urls = body.urls.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (urls.length > LINK_RESOLVE_MAX_URLS) {
      return Response.json(
        { error: `At most ${LINK_RESOLVE_MAX_URLS} URLs per request` },
        { status: 400, headers: { "Cache-Control": NO_STORE } },
      );
    }

    const budget = dependencies.consumeBudget(request, urls.length);
    if (!budget.allowed) {
      return Response.json(
        { error: "Link resolve budget spent — try again shortly." },
        {
          status: 429,
          headers: {
            "Cache-Control": NO_STORE,
            "Retry-After": String(budget.retryAfterSeconds),
            "X-RateLimit-Remaining": String(budget.remaining),
          },
        },
      );
    }

    const rows = await mapWithConcurrency(urls, CONCURRENCY, (url) => resolveOne(url.trim(), dependencies));
    return Response.json(rows, {
      headers: {
        "Cache-Control": NO_STORE,
        "X-RateLimit-Remaining": String(budget.remaining),
      },
    });
  };
}