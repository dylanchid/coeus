import { lookup } from "node:dns/promises";
import Parser from "rss-parser";
import { fetchFeedText, UnsafeFeedUrlError } from "./safeFeedFetch.server.ts";
import { findFeedLink } from "./feedDiscovery.ts";

const parser = new Parser({
  timeout: 6_000,
  headers: {
    "User-Agent": "coeus/1.0 (+local news reader)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

type ParsedFeed = Awaited<ReturnType<Parser["parseString"]>>;

export type ResolveFeedResult =
  | { ok: true; feedUrl: string; feed: ParsedFeed }
  | { ok: false; error: string };

const NOT_FOUND_ERROR =
  "Coeus couldn't find a feed at that URL. Try pasting the feed link directly.";

function isSubstackHomepage(url: URL): boolean {
  return url.hostname.toLowerCase().endsWith(".substack.com") &&
    (url.pathname === "/" || url.pathname === "");
}

async function tryParseAsFeed(text: string): Promise<ParsedFeed | null> {
  try {
    const feed = await parser.parseString(text);
    return feed.items?.length ? feed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a pasted publication URL to a working feed. Tries the URL as-is
 * first, then the Substack `/feed` convention (cheap — no extra HTML fetch),
 * then generic <link rel="alternate"> autodiscovery from the homepage HTML
 * already fetched in step one — covering WordPress, Ghost, and most
 * static-site blogs. Every candidate goes through the SSRF-hardened fetch
 * since these URLs are visitor-controlled.
 *
 * `fetcher` defaults to `undefined`, not the global `fetch`: `fetchFeedText`
 * only takes its DNS-pinned `fetchValidatedHttps` path when it receives no
 * fetcher, and an unpinned `fetch()` here would resolve the hostname a second
 * time — the exact rebinding window the pin closes. Tests inject a fetcher.
 */
export async function resolveFeedUrl(
  rawUrl: string,
  fetcher: typeof fetch | undefined = undefined,
  resolve = lookup
): Promise<ResolveFeedResult> {
  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }

  const conventionUrl = new URL("/feed", base).toString();
  if (isSubstackHomepage(base)) {
    try {
      const text = await fetchFeedText(conventionUrl, fetcher, resolve);
      const feed = await tryParseAsFeed(text);
      if (feed) return { ok: true, feedUrl: conventionUrl, feed };
    } catch (error) {
      if (error instanceof UnsafeFeedUrlError) return { ok: false, error: error.message };
    }
  }

  let baseHtml: string | null = null;
  try {
    const text = await fetchFeedText(base.toString(), fetcher, resolve);
    const feed = await tryParseAsFeed(text);
    if (feed) return { ok: true, feedUrl: base.toString(), feed };
    baseHtml = text;
  } catch (error) {
    if (error instanceof UnsafeFeedUrlError) return { ok: false, error: error.message };
  }

  if (!isSubstackHomepage(base) && conventionUrl !== base.toString()) {
    try {
      const text = await fetchFeedText(conventionUrl, fetcher, resolve);
      const feed = await tryParseAsFeed(text);
      if (feed) return { ok: true, feedUrl: conventionUrl, feed };
    } catch (error) {
      if (error instanceof UnsafeFeedUrlError) return { ok: false, error: error.message };
    }
  }

  if (baseHtml) {
    const discovered = findFeedLink(baseHtml, base.toString());
    if (discovered) {
      try {
        const text = await fetchFeedText(discovered, fetcher, resolve);
        const feed = await tryParseAsFeed(text);
        if (feed) return { ok: true, feedUrl: discovered, feed };
      } catch (error) {
        if (error instanceof UnsafeFeedUrlError) return { ok: false, error: error.message };
      }
    }
  }

  return { ok: false, error: NOT_FOUND_ERROR };
}
