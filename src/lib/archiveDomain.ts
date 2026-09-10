import type { Article } from "./types";
import type { ArchiveData, ArchiveItem } from "./archiveTypes";
import { inferArticleIndex } from "./articleIndex.ts";

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
