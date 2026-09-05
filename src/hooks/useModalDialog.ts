"use client";

import { useEffect, useEffectEvent, useState, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => {
      if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
      if (element.closest("[hidden], [inert]")) return false;
      const closedDetails = element.closest("details:not([open])");
      return !closedDetails || element === closedDetails.querySelector("summary");
    }
  );
}

function makeBackgroundInert(container: HTMLElement): () => void {
  const previous = new Map<HTMLElement, boolean>();
  let branch: HTMLElement | null = container;

  while (branch?.parentElement) {
    const parent: HTMLElement = branch.parentElement;
    for (const sibling of parent.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
      previous.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    if (parent === document.body) break;
    branch = parent;
  }

  return () => {
    for (const [element, inert] of previous) element.inert = inert;
  };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useFocusReturn(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    return () => opener?.focus();
  }, [active]);
}

export function useModalDialog({
  active,
  containerRef,
  initialFocusRef,
  onClose,
}: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const restoreInert = makeBackgroundInert(container);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusInitial = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusableElements(container)[0] ?? container;
      target.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreInert();
      opener?.focus();
    };
  }, [active, containerRef, initialFocusRef]);
}
