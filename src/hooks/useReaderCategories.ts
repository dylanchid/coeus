"use client";

import { useCallback, useMemo, useState } from "react";
import { sourceByIdMap } from "@/lib/feeds/sources";
import type { SourceFeed, UserPrefs } from "@/lib/types";

/** Category tags are derived from the loaded source definitions for this session. */
export function useReaderCategories(sources: SourceFeed[], customSources: UserPrefs["customSources"] | undefined) {
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(true);

  const tagsBySource = useMemo(() => {
    const defs = sourceByIdMap(customSources);
    return new Map(sources.map((source) => [source.id, defs.get(source.id)?.topics ?? []]));
  }, [sources, customSources]);
  const categoryOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const tags of tagsBySource.values()) {
      for (const tag of tags) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [tagsBySource]);
  const activeCategories = useMemo(
    () => categories.filter((tag) => categoryOptions.some((option) => option.toLowerCase() === tag.toLowerCase())),
    [categories, categoryOptions]
  );
  const categoryScoped = useMemo(() => {
    if (activeCategories.length === 0) return sources;
    const wanted = new Set(activeCategories.map((tag) => tag.toLowerCase()));
    return sources.filter((source) =>
      (tagsBySource.get(source.id) ?? []).some((tag) => wanted.has(tag.toLowerCase()))
    );
  }, [sources, tagsBySource, activeCategories]);
  const toggleCategory = useCallback((tag: string) => {
    setCategories((current) => {
      const selected = current.some((item) => item.toLowerCase() === tag.toLowerCase());
      if (selected) return current.filter((item) => item.toLowerCase() !== tag.toLowerCase());
      return multiSelect ? [...current, tag] : [tag];
    });
  }, [multiSelect]);
  const changeMultiSelect = useCallback((selected: boolean) => {
    setMultiSelect(selected);
    if (!selected) setCategories((current) => current.slice(0, 1));
  }, []);

  return {
    categoriesOpen, setCategoriesOpen, categoryOptions, activeCategories,
    categoryScoped, toggleCategory, multiSelect, changeMultiSelect,
    clearCategories: () => setCategories([]),
  };
}
