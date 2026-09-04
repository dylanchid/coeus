import "server-only";

import Parser from "rss-parser";
import {
  enrichHnEngagement,
  extractEngagementFromRssItem,
} from "./engagement.server";
import { sourceByIdMap } from "./sources";
import type { Article, Engagement, SourceDef, SourceFeed } from "./types";
import { fetchFeedText } from "./safeFeedFetch.server";
import {
  decodeHtmlEntities,
  extractSummary,
  stripHtmlFast,
  vetCachedSummary,
} from "./summary";

const parser = new Parser({
  timeout: 6_000,
  headers: {
    "User-Agent": "bareaga/1.0 (+local news reader)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: ["description", "media:description", "comments"],
  },
});

/** Keep up to this many items per feed in cache (slice later by limit/hours). */
const CACHE_MAX_ITEMS = 50;
/** Fresh cache: serve without network. */
const CACHE_FRESH_MS = 3 * 60 * 1000;
/** Stale-but-usable: serve immediately, revalidate in background. */
const CACHE_STALE_MS = 20 * 60 * 1000;
const FETCH_CONCURRENCY = 8;
/** Bump when summary quality / engagement fields change so process cache isn't sticky garbage. */
const SUMMARY_QUALITY_VERSION = 5;

type CachedArticle = {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  summary: string;
  author: string;
  publishedAt: string | null;
  engagement?: Engagement;
};

function itemAuthor(item: Parser.Item): string {
  const ext = item as Parser.Item & {
    author?: string;
    creator?: string;
    "dc:creator"?: string;
  };
  const raw = ext.creator || ext.author || ext["dc:creator"] || "";
  if (!raw) return "";
  // Strip emails in "Name <email>" or bare emails
  const cleaned = stripHtmlFast(String(raw))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || (cleaned.includes("@") && cleaned.split(/\s+/).length === 1)) {
    return cleaned.includes("@") ? "" : cleaned;
  }
  return cleaned.replace(/\s*<[^>]+>\s*/g, "").trim();
}

type CacheEntry = {
  fetchedAt: number;
  articles: CachedArticle[];
  error?: string;
  summaryQuality?: number;
};

/** Process-local feed cache (survives across requests in Node). */
const feedCache = new Map<string, CacheEntry>();
/** In-flight de-dupe so concurrent requests share one network fetch. */
const inflight = new Map<string, Promise<CacheEntry>>();

function ageLabel(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function itemDate(item: Parser.Item): Date | null {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function itemSummary(item: Parser.Item, title: string): string {
  const ext = item as Parser.Item & {
    description?: string;
    "media:description"?: string;
  };
  return extractSummary(
    {
      contentSnippet: item.contentSnippet,
      summary: item.summary,
      content: typeof item.content === "string" ? item.content : undefined,
      description:
        ext.description ||
        (typeof ext["media:description"] === "string"
          ? ext["media:description"]
          : undefined),
    },
    title
  );
}

function humanizeFeedError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timed?\s*out|timeout|abort/i.test(message)) {
    return "the publisher took too long to respond";
  }
  if (/ENOTFOUND|getaddrinfo|name resolution/i.test(message)) {
    return "the publisher’s server could not be found";
  }
  if (/ECONNREFUSED|ECONNRESET|socket hang up/i.test(message)) {
    return "the publisher closed the connection";
  }
  const status = message.match(/status(?: code)?\s*(\d{3})/i)?.[1];
  if (status) {
    if (status === "404") return "the publisher no longer provides this feed";
    if (status === "403") return "the publisher blocked the feed request";
    if (status.startsWith("5")) return "the publisher’s server is unavailable";
    return `the publisher returned HTTP ${status}`;
  }
  if (/XML|RSS|Atom|parse|unexpected/i.test(message)) {
    return "the publisher returned an unreadable feed";
  }
  return "the publisher’s feed is temporarily unavailable";
}

async function networkFetch(sourceId: string, sourceById: Map<string, SourceDef>): Promise<CacheEntry> {
  const def = sourceById.get(sourceId);
  if (!def) {
    return {
      fetchedAt: Date.now(),
      articles: [],
      error: "Unknown source",
      summaryQuality: SUMMARY_QUALITY_VERSION,
    };
  }

  try {
    const feed = await parser.parseString(await fetchFeedText(def.feedUrl));
    const articles: CachedArticle[] = [];

    for (const item of feed.items) {
      const published = itemDate(item);
      const title = decodeHtmlEntities(stripHtmlFast(item.title || "")).trim();
      const url = (item.link || "").trim();
      if (!title || !url) continue;

      const engagement = extractEngagementFromRssItem(item, def.id);

      articles.push({
        id: `${def.id}:${url}`,
        sourceId: def.id,
        title,
        url,
        summary: itemSummary(item, title),
        author: itemAuthor(item),
        publishedAt: published ? published.toISOString() : null,
        ...(engagement ? { engagement } : {}),
      });

      if (articles.length >= CACHE_MAX_ITEMS) break;
    }

    // Fresher HN points/comments via Firebase API (cached 8m); keep RSS on failure
    if (def.id === "hn") {
      try {
        await enrichHnEngagement(articles, { concurrency: 8 });
      } catch {
        // RSS snapshot already attached
      }
    }

    return {
      fetchedAt: Date.now(),
      articles,
      summaryQuality: SUMMARY_QUALITY_VERSION,
    };
  } catch (err) {
    return {
      fetchedAt: Date.now(),
      articles: [],
      error: humanizeFeedError(err),
      summaryQuality: SUMMARY_QUALITY_VERSION,
    };
  }
}

function getOrFetchEntry(sourceId: string, forceRefresh: boolean, sourceById: Map<string, SourceDef>): {
  entry: CacheEntry | null;
  promise: Promise<CacheEntry> | null;
  fromCache: boolean;
  revalidating: boolean;
} {
  const now = Date.now();
  const cached = feedCache.get(sourceId);
  // Invalidate entries built before current summary quality rules
  const cacheUsable =
    cached && cached.summaryQuality === SUMMARY_QUALITY_VERSION;

  if (!forceRefresh && cacheUsable && cached) {
    const age = now - cached.fetchedAt;
    if (age < CACHE_FRESH_MS) {
      return { entry: cached, promise: null, fromCache: true, revalidating: false };
    }
    if (age < CACHE_STALE_MS) {
      // Stale-while-revalidate
      let promise = inflight.get(sourceId) ?? null;
      if (!promise) {
        promise = networkFetch(sourceId, sourceById).then((entry) => {
          // Keep previous good data if revalidate fails empty with error
          if (entry.error && cached.articles.length && !entry.articles.length) {
            const merged = { ...cached, fetchedAt: Date.now() };
            feedCache.set(sourceId, merged);
            inflight.delete(sourceId);
            return merged;
          }
          feedCache.set(sourceId, entry);
          inflight.delete(sourceId);
          return entry;
        });
        inflight.set(sourceId, promise);
      }
      return { entry: cached, promise, fromCache: true, revalidating: true };
    }
  }

  let promise = inflight.get(sourceId);
  if (!promise) {
    promise = networkFetch(sourceId, sourceById).then((entry) => {
      feedCache.set(sourceId, entry);
      inflight.delete(sourceId);
      return entry;
    });
    inflight.set(sourceId, promise);
  }

  return { entry: null, promise, fromCache: false, revalidating: false };
}

function materialize(
  sourceId: string,
  entry: CacheEntry,
  limit: number,
  hours: number,
  sourceById: Map<string, SourceDef>
): SourceFeed {
  const def = sourceById.get(sourceId);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const articles: Article[] = [];

  for (const a of entry.articles) {
    if (a.publishedAt) {
      const t = Date.parse(a.publishedAt);
      if (!Number.isNaN(t) && t < cutoff) continue;
    }
    articles.push({
      ...a,
      author: a.author ?? "",
      // Re-vet on read so upgrades apply even if cache wasn't version-bumped
      summary: vetCachedSummary(a.summary ?? "", a.title),
      ageLabel: ageLabel(a.publishedAt),
    });
    if (articles.length >= limit) break;
  }

  return {
    id: sourceId,
    name: def?.name ?? sourceId,
    topic: def?.topic ?? "all",
    homeUrl: def?.homeUrl,
    articles,
    error: entry.error,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function fetchFeeds(options: {
  sourceIds: string[];
  limit: number;
  hours: number;
  forceRefresh?: boolean;
  customSources?: SourceDef[];
}): Promise<{
  sources: SourceFeed[];
  updatedAt: string;
  cache: { hits: number; misses: number; revalidating: number };
}> {
  const { sourceIds, limit, hours, forceRefresh = false, customSources = [] } = options;
  const sourceById = sourceByIdMap(customSources);
  let hits = 0;
  let misses = 0;
  let revalidating = 0;

  const sources = await mapPool(sourceIds, FETCH_CONCURRENCY, async (id) => {
    const { entry, promise, fromCache, revalidating: rev } = getOrFetchEntry(
      id,
      forceRefresh,
      sourceById
    );
    if (fromCache && entry) {
      hits++;
      if (rev) revalidating++;
      // Fire-and-forget revalidation; don't wait
      return materialize(id, entry, limit, hours, sourceById);
    }
    misses++;
    const resolved = promise ? await promise : feedCache.get(id)!;
    return materialize(id, resolved, limit, hours, sourceById);
  });

  const newest = Math.max(
    0,
    ...sourceIds.map((id) => feedCache.get(id)?.fetchedAt ?? 0)
  );

  return {
    sources,
    updatedAt: new Date(newest || Date.now()).toISOString(),
    cache: { hits, misses, revalidating },
  };
}
