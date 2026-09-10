"use client";

import { forwardRef, useState } from "react";

type Props = {
  value: string;
  matchCount: number;
  matchSourceCount: number;
  totalCount: number;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export const SearchBar = forwardRef<HTMLInputElement, Props>(
  function SearchBar(
    { value, matchCount, matchSourceCount, totalCount, onChange, onBlur },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    return (
      <div className={`search-bar${focused ? " is-focused" : ""}`}>
        <label htmlFor="keyword-search" className="search-label">
          Search
        </label>
        <input
          ref={ref}
          id="keyword-search"
          type="search"
          className="search-input"
          placeholder={focused ? "Keywords in titles and summaries" : "Search titles & summaries · ?"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur(); }}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="search-meta" aria-live="polite">
          {value.trim()
            ? `${matchCount} match${matchCount === 1 ? "" : "es"} across ${matchSourceCount} source${matchSourceCount === 1 ? "" : "s"}`
            : `${totalCount} stories`}
        </span>
        {value ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => onChange("")}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
    );
  }
);
