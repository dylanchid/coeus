"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import {
  buildSlashItems,
  buildArticleSlashItems,
  filterSlashItems,
  groupRankedItems,
  type SlashBuildContext,
  type RankedSlashItem,
  type SlashItem,
} from "@/lib/slashCommands";

const EMPTY_SLASH_ITEMS: SlashItem[] = [];

type Props = {
  open: boolean;
  onClose: () => void;
  context: SlashBuildContext;
};

export function SlashMenu({ open, onClose, context }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");

  useModalDialog({ active: open, containerRef: dialogRef, initialFocusRef: inputRef, onClose });

  // Article commands are deferred: feed results can contain hundreds of headlines.
  const baseItems = useMemo(
    () => (open ? buildSlashItems(context) : EMPTY_SLASH_ITEMS),
    [open, context]
  );
  const articleItems = useMemo(
    () => (open ? buildArticleSlashItems(context.reader, query) : EMPTY_SLASH_ITEMS),
    [open, context.reader, query]
  );
  const items = useMemo(() => [...baseItems, ...articleItems], [baseItems, articleItems]);
  const ranked = useMemo(
    () => filterSlashItems(items, query),
    [items, query]
  );
  const groups = useMemo(() => groupRankedItems(ranked), [ranked]);
  const flat = ranked;

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setQuery("");
      setActiveIndex(0);
      setError("");
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Clamp active index when results change
  useEffect(() => {
    if (flat.length === 0) {
      if (activeIndex !== 0) {
        const t = window.setTimeout(() => setActiveIndex(0), 0);
        return () => window.clearTimeout(t);
      }
      return;
    }
    if (activeIndex >= flat.length) {
      const t = window.setTimeout(() => {
        setActiveIndex(flat.length - 1);
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [flat.length, activeIndex]);

  // Scroll active row into view
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-slash-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, flat.length]);

  const runItem = useCallback(
    async (item: RankedSlashItem | undefined) => {
      if (!item) return;
      setError("");
      try {
        await item.run();
        onClose();
      } catch {
        setError(`“${item.label}” failed. Try again or use the corresponding page control.`);
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!dialogRef.current?.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      const handlesCommandKeys = target === inputRef.current || Boolean(target.closest("[role='option']"));
      if (!handlesCommandKeys) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) =>
          flat.length ? (i + 1) % flat.length : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) =>
          flat.length ? (i - 1 + flat.length) % flat.length : 0
        );
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(flat.length ? flat.length - 1 : 0);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void runItem(flat[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, flat, activeIndex, onClose, runItem]);

  if (!open) return null;

  let runningIndex = 0;

  return (
    <div
      className="slash-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="slash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? `${titleId}-error` : undefined}
        tabIndex={-1}
      >
        <header className="slash-head">
          <h2 id={titleId}>Slash menu</h2>
          <div className="slash-head-actions">
            <span className="slash-head-meta"><kbd>↑↓</kbd> move · <kbd>↵</kbd> run</span>
            <button type="button" className="slash-close" onClick={onClose} aria-label="Close commands">×</button>
          </div>
        </header>

        <div className="slash-input-row">
          <span className="slash-prompt" aria-hidden>
            /
          </span>
          <input
            ref={inputRef}
            className="slash-input"
            type="text"
            role="combobox"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Commands, topics, sources, headlines…"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="slash-results"
            aria-activedescendant={
              flat[activeIndex]
                ? `slash-item-${flat[activeIndex]!.id}`
                : undefined
            }
          />
          {query ? (
            <button
              type="button"
              className="slash-clear"
              onClick={() => {
                setQuery("");
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
            >
              clear
            </button>
          ) : null}
        </div>

        <div
          id="slash-results"
          className="slash-results"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
        >
          {groups.length === 0 ? (
            <p className="slash-empty">No matches for “{query.trim()}”.</p>
          ) : (
            groups.map(({ group, items: groupItems }) => {
              const groupId = `${titleId}-${group.toLowerCase()}`;
              return (
              <section key={group} className="slash-group" role="group" aria-labelledby={groupId}>
                <h3 id={groupId} className="slash-group-label">{group}</h3>
                <ul className="slash-list" role="presentation">
                  {groupItems.map((item) => {
                    const index = runningIndex++;
                    const active = index === activeIndex;
                    return (
                      <li key={item.id} role="presentation">
                        <button
                          type="button"
                          id={`slash-item-${item.id}`}
                          role="option"
                          aria-selected={active}
                          data-slash-index={index}
                          className={`slash-item${active ? " is-active" : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => void runItem(item)}
                        >
                          <span className="slash-item-label">{item.label}</span>
                          {item.hint ? (
                            <span className="slash-item-hint">{item.hint}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );})
          )}
        </div>

        {error ? <p id={`${titleId}-error`} className="slash-error" role="alert">{error}</p> : null}

        <footer className="slash-foot">
          <span>
            {query.trim()
              ? `${flat.length} match${flat.length === 1 ? "" : "es"}`
              : "Type to fuzzy-find · empty shows primaries"}
          </span>
          <span className="slash-foot-keys">
            <kbd>/</kbd> or <kbd>⌘K</kbd>
          </span>
        </footer>
      </div>
    </div>
  );
}
