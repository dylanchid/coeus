"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildSlashItems,
  filterSlashItems,
  groupRankedItems,
  type SlashBuildContext,
  type RankedSlashItem,
} from "@/lib/slashCommands";

type Props = {
  open: boolean;
  onClose: () => void;
  context: SlashBuildContext;
};

export function SlashMenu({ open, onClose, context }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // Build every open render so command handlers always see latest prefs/actions
  const items = useMemo(
    () => (open ? buildSlashItems(context) : []),
    [open, context]
  );
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
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Clamp active index when results change
  useEffect(() => {
    if (activeIndex >= flat.length) {
      const t = window.setTimeout(() => {
        setActiveIndex(flat.length ? flat.length - 1 : 0);
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
    (item: RankedSlashItem | undefined) => {
      if (!item) return;
      onClose();
      // Defer so close + focus transitions settle
      window.setTimeout(() => {
        try {
          item.run();
        } catch {
          // ignore command failures
        }
      }, 0);
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
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
        runItem(flat[activeIndex]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, flat, activeIndex, onClose, runItem]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
        className="slash-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="slash-head">
          <h2 id={titleId}>Slash menu</h2>
          <span className="slash-head-meta">
            <kbd>↑↓</kbd> move · <kbd>↵</kbd> run · <kbd>esc</kbd>
          </span>
        </header>

        <div className="slash-input-row">
          <span className="slash-prompt" aria-hidden>
            /
          </span>
          <input
            ref={inputRef}
            className="slash-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Commands, topics, sources, headlines…"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
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
            groups.map(({ group, items: groupItems }) => (
              <section key={group} className="slash-group">
                <h3 className="slash-group-label">{group}</h3>
                <ul className="slash-list">
                  {groupItems.map((item) => {
                    const index = runningIndex++;
                    const active = index === activeIndex;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          id={`slash-item-${item.id}`}
                          role="option"
                          aria-selected={active}
                          data-slash-index={index}
                          className={`slash-item${active ? " is-active" : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => runItem(item)}
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
            ))
          )}
        </div>

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
