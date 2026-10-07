"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  buildSlashItems,
  filterSlashItems,
  groupRankedItems,
  type RankedSlashItem,
  type SlashBuildContext,
} from "@/lib/feeds/slashCommands";
import { usePreferences } from "./AppProviders";
import { useChrome } from "./ChromeProvider";
import { SearchIcon } from "./HeaderIcons";

/** Window event the global `/` and ⌘K shortcuts use to focus the box. */
export const FOCUS_HEADER_SEARCH_EVENT = "coeus:focus-header-search";

/**
 * One box, two modes. A query starting with `/` searches commands and settings
 * (the old slash menu); anything else searches articles — live on the Reader,
 * otherwise by handing the query to the Reader and navigating Home.
 */
export function HeaderSearch({ commandContext }: { commandContext: SlashBuildContext | null }) {
  const router = useRouter();
  const { prefs, updatePrefs } = usePreferences();
  const { readerSlash } = useChrome();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // `draft` is non-null only while the user is editing; otherwise the box
  // mirrors the persisted article search so Home and the header agree.
  const [draft, setDraft] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");

  const value = draft ?? prefs?.lastSearch ?? "";
  const commandMode = draft !== null && draft.startsWith("/");
  const commandQuery = commandMode ? draft.slice(1) : "";

  const baseItems = useMemo(
    () => (commandMode && commandContext ? buildSlashItems(commandContext) : []),
    [commandMode, commandContext],
  );
  const ranked = useMemo(() => filterSlashItems(baseItems, commandQuery), [baseItems, commandQuery]);
  const groups = useMemo(() => groupRankedItems(ranked), [ranked]);
  const active = Math.min(activeIndex, Math.max(ranked.length - 1, 0));

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const command = (event as CustomEvent<{ command?: boolean }>).detail?.command;
      setDraft(command ? "/" : (prefs?.lastSearch ?? ""));
      setActiveIndex(0);
      setError("");
      inputRef.current?.focus();
      if (!command) inputRef.current?.select();
    };
    window.addEventListener(FOCUS_HEADER_SEARCH_EVENT, onFocusRequest);
    return () => window.removeEventListener(FOCUS_HEADER_SEARCH_EVENT, onFocusRequest);
  }, [prefs?.lastSearch]);

  const searchArticles = (query: string) => {
    if (readerSlash) {
      readerSlash.onSearch(query);
      return;
    }
    updatePrefs({ lastSearch: query });
    router.push("/");
  };

  const runCommand = async (item: RankedSlashItem | undefined) => {
    if (!item) return;
    setError("");
    try {
      await item.run();
      setDraft(null);
      inputRef.current?.blur();
    } catch {
      setError(`“${item.label}” failed. Try again or use the corresponding page control.`);
    }
  };

  const onChange = (next: string) => {
    setDraft(next);
    setActiveIndex(0);
    setError("");
    // On the Reader the grid filters as you type; elsewhere Enter submits.
    if (readerSlash && !next.startsWith("/")) readerSlash.onSearch(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (commandMode) {
      void runCommand(ranked[active]);
      return;
    }
    searchArticles(value.trim());
    inputRef.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(null);
      inputRef.current?.blur();
      return;
    }
    if (!commandMode || ranked.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((active + 1) % ranked.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((active - 1 + ranked.length) % ranked.length);
    }
  };

  let runningIndex = 0;

  return (
    <form className="header-search" role="search" onSubmit={onSubmit}>
      <input
        ref={inputRef}
        className="header-search-input"
        type="text"
        name="q"
        aria-label="Search articles, or start with / for commands and settings"
        placeholder="/Search"
        value={value}
        autoComplete="off"
        spellCheck={false}
        role={commandMode ? "combobox" : undefined}
        aria-expanded={commandMode ? true : undefined}
        aria-controls={commandMode ? listId : undefined}
        aria-activedescendant={commandMode && ranked[active] ? `${listId}-${ranked[active].id}` : undefined}
        onFocus={() => setDraft((current) => current ?? prefs?.lastSearch ?? "")}
        onBlur={() => setDraft(null)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="header-search-submit" aria-label="Search">
        <SearchIcon />
      </button>

      {commandMode ? (
        // mousedown must not blur the input before the click lands.
        <div className="header-search-results" id={listId} role="listbox" aria-label="Commands and settings" onMouseDown={(event) => event.preventDefault()}>
          {groups.length === 0 ? (
            <p className="header-search-empty">No commands or settings match “{commandQuery.trim()}”.</p>
          ) : (
            groups.map(({ group, items }) => (
              <section key={group} role="group" aria-label={group}>
                <h3 className="header-search-group">{group}</h3>
                {items.map((item) => {
                  const index = runningIndex++;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      id={`${listId}-${item.id}`}
                      role="option"
                      aria-selected={index === active}
                      className={`header-search-item${index === active ? " is-active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => void runCommand(item)}
                    >
                      <span>{item.label}</span>
                      {item.hint ? <span className="header-search-hint">{item.hint}</span> : null}
                    </button>
                  );
                })}
              </section>
            ))
          )}
          {error ? <p className="header-search-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
