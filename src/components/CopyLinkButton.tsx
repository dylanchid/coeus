"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Copy the collection's canonical URL. Shows a short confirmation and falls back
 * to select-text when the Clipboard API is unavailable.
 */
export function CopyLinkButton({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallback = useRef<HTMLInputElement>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const copy = useCallback(async () => {
    clearTimer();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = fallback.current;
        if (!field) return;
        field.value = url;
        field.select();
        field.setSelectionRange(0, url.length);
        document.execCommand("copy");
      }
      setCopied(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        setCopied(false);
      }, 2000);
    } catch {
      const field = fallback.current;
      if (field) {
        field.value = url;
        field.select();
      }
    }
  }, [clearTimer, url]);

  const label = copied ? "Copied ✓" : "Copy link";

  return (
    <>
      <button
        type="button"
        className={className ?? "follow-control follow-control--secondary"}
        onClick={() => void copy()}
        aria-live="polite"
      >
        {label}
      </button>
      <input
        ref={fallback}
        type="text"
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="public-collection-copy-fallback"
        defaultValue=""
      />
    </>
  );
}