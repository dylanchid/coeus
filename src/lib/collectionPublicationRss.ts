import type { CollectionPublication } from "./collectionPublication.ts";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date(0).toUTCString() : date.toUTCString();
}

export interface CollectionRssOptions {
  feedUrl: string;
  collectionUrl: string;
}

/**
 * RSS 2.0 for a published collection's items. Item pubDate is intentionally
 * omitted: derivePublicationSnapshot() does not carry each item's private
 * savedAt, and fabricating one would misrepresent when a piece was added.
 */
export function renderCollectionRss(publication: CollectionPublication, options: CollectionRssOptions): string {
  const channelDescription = [publication.description, publication.curatorNote].filter(Boolean).join(" — ") || publication.name;

  const items = publication.items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const itemDescription = [item.curatorComment, item.excerpt].filter(Boolean).join(" — ");
      return [
        "<item>",
        `<title>${escapeXml(item.title)}</title>`,
        `<link>${escapeXml(item.url)}</link>`,
        `<guid isPermaLink="false">${escapeXml(`${publication.id}:${item.itemLocalId}`)}</guid>`,
        itemDescription ? `<description>${escapeXml(itemDescription)}</description>` : "",
        item.author ? `<author>${escapeXml(item.author)}</author>` : "",
        item.sourceName ? `<source>${escapeXml(item.sourceName)}</source>` : "",
        "</item>",
      ].filter(Boolean).join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(publication.name)}</title>`,
    `<link>${escapeXml(options.collectionUrl)}</link>`,
    `<atom:link href="${escapeXml(options.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(channelDescription)}</description>`,
    `<pubDate>${rfc822(publication.publishedAt)}</pubDate>`,
    `<lastBuildDate>${rfc822(publication.updatedAt)}</lastBuildDate>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}
