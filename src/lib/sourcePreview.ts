import { slugifyId } from "./sources.ts";

interface ParsedFeedLike {
  title?: string;
  description?: string;
  link?: string;
  items?: unknown[];
}

export interface SourcePreview {
  id: string;
  name: string;
  feedUrl: string;
  homeUrl: string;
  description: string;
  itemCount: number;
}

/** Pure shaping of a parsed feed into an addable source preview; no I/O. */
export function buildSourcePreview(feed: ParsedFeedLike, feedUrl: string): SourcePreview {
  const fallbackName = (() => {
    try {
      return new URL(feedUrl).hostname;
    } catch {
      return "Custom feed";
    }
  })();
  const name = (feed.title || fallbackName).trim().slice(0, 120) || fallbackName;

  const homeUrl = (() => {
    try {
      return feed.link ? new URL(feed.link, feedUrl).toString() : new URL(feedUrl).origin;
    } catch {
      try {
        return new URL(feedUrl).origin;
      } catch {
        return feedUrl;
      }
    }
  })();

  return {
    id: slugifyId(name),
    name,
    feedUrl,
    homeUrl,
    description: (feed.description || "").trim().slice(0, 280),
    itemCount: Array.isArray(feed.items) ? feed.items.length : 0,
  };
}
