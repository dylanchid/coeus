"use client";

import { useMemo, useState } from "react";
import type { ArchiveItem } from "@/lib/archive";

export type ArchiveFilter = "all" | "unread" | "starred" | "annotated";
export type ArchiveSort = "newest" | "oldest" | "title";

function matches(item: ArchiveItem, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [item.title, item.summary, item.sourceName, item.author, item.topic, item.note, ...item.tags].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Browse-only state; archive writes deliberately stay in ArchiveApp. */
export function useArchiveFilters(items: ArchiveItem[], collectionId: string) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const [sort, setSort] = useState<ArchiveSort>("newest");

  const collectionItems = useMemo(() => collectionId === "all" ? items : items.filter((item) => item.collectionIds.includes(collectionId)), [items, collectionId]);
  const counts = useMemo(() => ({
    all: collectionItems.length,
    unread: collectionItems.filter((item) => item.state === "unread").length,
    starred: collectionItems.filter((item) => item.starred).length,
    annotated: collectionItems.filter((item) => item.note.trim()).length,
  }), [collectionItems]);
  const visible = useMemo(() => [...collectionItems.filter((item) => {
    if (filter === "unread" && item.state !== "unread") return false;
    if (filter === "starred" && !item.starred) return false;
    if (filter === "annotated" && !item.note.trim()) return false;
    return matches(item, query);
  })].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const newestFirst = Date.parse(b.savedAt) - Date.parse(a.savedAt);
    return sort === "oldest" ? -newestFirst : newestFirst;
  }), [collectionItems, filter, query, sort]);

  return { query, setQuery, filter, setFilter, sort, setSort, collectionItems, counts, visible };
}
