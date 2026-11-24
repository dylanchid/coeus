import { escapeXml, rfc822 } from "../publications/collectionPublicationRss.ts";

export interface ProfileRssIdentity {
  handle: string;
  displayName: string;
  bio: string | null;
}

export interface ProfileRssCollection {
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  publishedAt: string;
}

export interface ProfileRssOptions {
  feedUrl: string;
  profileUrl: string;
  origin: string;
}

/** RSS 2.0 for a profile's newly published public collections. */
export function renderProfileRss(
  profile: ProfileRssIdentity,
  collections: readonly ProfileRssCollection[],
  options: ProfileRssOptions,
): string {
  const channelTitle = `${profile.displayName} (@${profile.handle})`;
  const channelDescription =
    profile.bio?.trim() || `Collections by @${profile.handle}`;

  const items = collections
    .map((collection) => {
      const collectionUrl = `${options.origin}/c/${collection.slug}`;
      const description = collection.curatorNote.trim() || collection.description;
      return [
        "<item>",
        `<title>${escapeXml(collection.name)}</title>`,
        `<link>${escapeXml(collectionUrl)}</link>`,
        `<guid isPermaLink="true">${escapeXml(collectionUrl)}</guid>`,
        description ? `<description>${escapeXml(description)}</description>` : "",
        `<pubDate>${rfc822(collection.publishedAt)}</pubDate>`,
        "</item>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  const buildDate =
    collections[0]?.publishedAt != null
      ? rfc822(collections[0].publishedAt)
      : new Date(0).toUTCString();

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${escapeXml(channelTitle)}</title>`,
    `<link>${escapeXml(options.profileUrl)}</link>`,
    `<atom:link href="${escapeXml(options.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(channelDescription)}</description>`,
    `<lastBuildDate>${buildDate}</lastBuildDate>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}