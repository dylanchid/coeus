"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import type { UserPrefs } from "@/lib/types";
import { FOCUS_HEADER_SEARCH_EVENT } from "@/components/HeaderSearch";

/** Mirrors the persisted query once, then owns the Reader's live search state. */
export function useSearchField({
  prefs,
  onSearchChange,
  closeSlash,
  slashOpen,
  refresh,
}: {
  prefs: UserPrefs | null;
  onSearchChange: (value: string) => void;
  closeSlash: () => void;
  slashOpen: boolean;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchHydrated = useRef(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!prefs || searchHydrated.current) return;
    searchHydrated.current = true;
    setSearch(prefs.lastSearch);
  }, [prefs]);

  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    onSearchChange(value);
  }, [onSearchChange]);

  const focusSearch = useCallback(() => {
    closeSlash();
    window.dispatchEvent(new CustomEvent(FOCUS_HEADER_SEARCH_EVENT, { detail: { command: false } }));
  }, [closeSlash]);

  // The global header owns `/` and ⌘K. Reader keeps `?` and refresh.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (slashOpen) return;
      const el = event.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable ||
          event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "?") {
        event.preventDefault();
        focusSearch();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slashOpen, focusSearch, refresh]);

  return { deferredSearch, changeSearch, focusSearch };
}
