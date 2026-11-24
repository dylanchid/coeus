import type { ArchiveItem } from "./archiveTypes.ts";

export const PASTE_LINKS_CAP = 50;

export type PasteLinkRejectReason = "not-a-web-link" | "duplicate";

export interface ParsedPastedLinks {
  links: string[];
  duplicatesSkipped: number;
  notWebLink: number;
  capped: boolean;
}

function isWebUrl(line: string): boolean {
  try {
    const url = new URL(line);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pure parse for the paste-links textarea: http(s) only, trim, de-dupe, cap 50. */
export function parsePastedLinks(text: string): ParsedPastedLinks {
  const seen = new Set<string>();
  const links: string[] = [];
  let duplicatesSkipped = 0;
  let notWebLink = 0;
  let capped = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!isWebUrl(line)) {
      notWebLink += 1;
      continue;
    }
    const key = line.toLowerCase();
    if (seen.has(key)) {
      duplicatesSkipped += 1;
      continue;
    }
    seen.add(key);
    if (links.length >= PASTE_LINKS_CAP) {
      capped = true;
      break;
    }
    links.push(line);
  }

  return { links, duplicatesSkipped, notWebLink, capped };
}

export interface ResolvedPasteLink {
  url: string;
  title: string;
  sourceName: string;
  author: string;
  excerpt: string;
  ok: boolean;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/** Shape used when filing pasted URLs into a collection (before budget validation). */
export function resolvedLinkToItem(
  link: ResolvedPasteLink,
  collectionId: string,
  now: Date,
): ArchiveItem {
  const host = hostnameOf(link.url);
  const title = link.title.trim() || host;
  const sourceName = link.sourceName.trim() || host;
  return {
    id: `saved-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    articleId: `link:${link.url}`,
    title,
    url: link.url,
    sourceName,
    topic: "all",
    summary: link.excerpt.trim(),
    author: link.author.trim(),
    publishedAt: null,
    savedAt: now.toISOString(),
    state: "unread",
    starred: false,
    collectionIds: [collectionId],
    tags: [],
    note: "",
  };
}