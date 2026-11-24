import type { Article } from "../types";
import type { ArchiveData, ArchiveItem } from "./archiveTypes";
import { inferArticleIndex } from "../articles/articleIndex.ts";
import { resolvedLinkToItem, type ResolvedPasteLink } from "./pasteLinks.ts";

function appendCollectionId(collectionIds: string[], collectionId: string): string[] {
  if (!collectionId || collectionIds.includes(collectionId)) return collectionIds;
  return [...collectionIds, collectionId];
}

function findItemByUrl(items: ArchiveItem[], url: string): ArchiveItem | undefined {
  const key = url.toLowerCase();
  return items.find((item) => item.url.toLowerCase() === key);
}

export function archiveArticle(
  data: ArchiveData,
  article: Article,
  sourceName: string,
  topic: string,
  now = new Date()
): ArchiveData {
  const existing = data.items.find(
    (item) => item.articleId === article.id || item.url === article.url
  );
  if (existing) return data;
  const index = inferArticleIndex({ title: article.title, description: article.summary, sourceTopic: topic });
  const item: ArchiveItem = {
    id: `saved-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    articleId: article.id,
    title: article.title,
    url: article.url,
    sourceName,
    topic,
    summary: article.summary,
    author: article.author,
    publishedAt: article.publishedAt,
    savedAt: now.toISOString(),
    state: "unread",
    starred: false,
    collectionIds: ["inbox"],
    tags: [...index.topics, ...index.keywords].slice(0, 6),
    note: "",
  };
  return { ...data, items: [item, ...data.items] };
}

/** Bulk-add: append the collection id on each item without removing other memberships. */
export function addItemsToCollection(data: ArchiveData, itemIds: string[], collectionId: string): ArchiveData {
  if (!collectionId || !itemIds.length) return data;
  const wanted = new Set(itemIds);
  let changed = false;
  const items = data.items.map((item) => {
    if (!wanted.has(item.id)) return item;
    const collectionIds = appendCollectionId(item.collectionIds, collectionId);
    if (collectionIds === item.collectionIds) return item;
    changed = true;
    return { ...item, collectionIds };
  });
  return changed ? { ...data, items } : data;
}

/**
 * File pasted URLs into a collection. Reuses an existing saved item when the URL
 * already exists instead of duplicating.
 */
export function addLinksToCollection(
  data: ArchiveData,
  links: ResolvedPasteLink[],
  collectionId: string,
  now = new Date(),
): ArchiveData {
  if (!collectionId || !links.length) return data;
  let items = data.items;
  let changed = false;

  for (const link of links) {
    const existing = findItemByUrl(items, link.url);
    if (existing) {
      const collectionIds = appendCollectionId(existing.collectionIds, collectionId);
      if (collectionIds !== existing.collectionIds) {
        items = items.map((item) => (item.id === existing.id ? { ...item, collectionIds } : item));
        changed = true;
      }
      continue;
    }
    const item = resolvedLinkToItem(link, collectionId, now);
    items = [item, ...items];
    changed = true;
  }

  return changed ? { ...data, items } : data;
}
