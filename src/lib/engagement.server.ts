import "server-only";

import type Parser from "rss-parser";
import type { Engagement } from "./types";

const POINTS_RE = /(?:^|\n|<p[^>]*>)\s*Points?\s*:\s*(\d+)/i;
const COMMENTS_COUNT_RE = /(?:^|\n|<p[^>]*>)\s*(?:#\s*)?Comments?\s*:\s*(\d+)/i;
const HN_ITEM_ID_RE = /news\.ycombinator\.com\/item\?id=(\d+)/i;
const GENERIC_SCORE_RE = /(?:^|\n)\s*(?:Score|Upvotes?)\s*:\s*(\d+)/i;
const HN_METRICS_TTL_MS = 8 * 60 * 1000;

const hnMetricsCache = new Map<string, { at: number; engagement: Engagement | null }>();

function numOrUndef(n: number | undefined): number | undefined {
  if (n === undefined || Number.isNaN(n) || n < 0) return undefined;
  return Math.floor(n);
}

export function extractHnItemId(
  commentsUrl?: string | null,
  guid?: string | null,
  description?: string | null
): string | undefined {
  for (const raw of [commentsUrl, guid, description]) {
    if (!raw) continue;
    const match = String(raw).match(HN_ITEM_ID_RE);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function extractEngagementFromRssItem(
  item: Parser.Item,
  sourceId: string
): Engagement | undefined {
  const ext = item as Parser.Item & { comments?: string; description?: string };
  const description =
    (typeof item.content === "string" ? item.content : "") ||
    (typeof ext.description === "string" ? ext.description : "") ||
    (typeof item.summary === "string" ? item.summary : "") ||
    (typeof item.contentSnippet === "string" ? item.contentSnippet : "");
  const commentsField = typeof ext.comments === "string" ? ext.comments : undefined;

  let guidRaw: string | undefined;
  const guid = item.guid as unknown;
  if (typeof guid === "string") guidRaw = guid;
  else if (guid && typeof guid === "object" && "_" in guid) {
    guidRaw = String((guid as { _: unknown })._);
  }

  const pointsMatch = description.match(POINTS_RE);
  const commentsMatch = description.match(COMMENTS_COUNT_RE);
  const scoreMatch = pointsMatch ? null : description.match(GENERIC_SCORE_RE);
  const points = numOrUndef(
    pointsMatch ? Number(pointsMatch[1]) : scoreMatch ? Number(scoreMatch[1]) : undefined
  );
  const comments = numOrUndef(commentsMatch ? Number(commentsMatch[1]) : undefined);
  const hnId = extractHnItemId(commentsField, guidRaw, description);
  const discussionUrl =
    commentsField && /news\.ycombinator\.com/i.test(commentsField)
      ? commentsField.trim()
      : hnId
        ? `https://news.ycombinator.com/item?id=${hnId}`
        : undefined;

  if (sourceId === "hn" || hnId) {
    if (points === undefined && comments === undefined && !discussionUrl) return undefined;
    return { points, comments, discussionUrl, provider: "hn", providerId: hnId };
  }
  if (points === undefined && comments === undefined) return undefined;
  return {
    points,
    comments,
    discussionUrl: commentsField?.startsWith("http") ? commentsField.trim() : undefined,
    provider: "rss",
  };
}

export async function fetchHnItemEngagement(
  itemId: string,
  signal?: AbortSignal
): Promise<Engagement | null> {
  const id = itemId.replace(/\D/g, "");
  if (!id) return null;
  const cached = hnMetricsCache.get(id);
  if (cached && Date.now() - cached.at < HN_METRICS_TTL_MS) return cached.engagement;

  try {
    const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      hnMetricsCache.set(id, { at: Date.now(), engagement: null });
      return null;
    }
    const data = (await response.json()) as {
      score?: number;
      descendants?: number;
      type?: string;
    } | null;
    if (!data || data.type === "comment") {
      hnMetricsCache.set(id, { at: Date.now(), engagement: null });
      return null;
    }
    const engagement: Engagement = {
      points: numOrUndef(data.score),
      comments: numOrUndef(data.descendants),
      discussionUrl: `https://news.ycombinator.com/item?id=${id}`,
      provider: "hn",
      providerId: id,
    };
    hnMetricsCache.set(id, { at: Date.now(), engagement });
    return engagement;
  } catch {
    return null;
  }
}

export async function enrichHnEngagement(
  articles: { engagement?: Engagement }[],
  opts?: { concurrency?: number; signal?: AbortSignal }
): Promise<void> {
  const targets = articles.filter(
    (article) => article.engagement?.provider === "hn" && article.engagement.providerId
  );
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const article = targets[next++];
      const id = article.engagement?.providerId;
      if (!id) continue;
      const live = await fetchHnItemEngagement(id, opts?.signal);
      if (!live) continue;
      article.engagement = {
        ...article.engagement,
        points: live.points ?? article.engagement?.points,
        comments: live.comments ?? article.engagement?.comments,
        discussionUrl: live.discussionUrl ?? article.engagement?.discussionUrl,
        provider: "hn",
        providerId: id,
      };
    }
  };
  const concurrency = Math.min(opts?.concurrency ?? 6, targets.length);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
