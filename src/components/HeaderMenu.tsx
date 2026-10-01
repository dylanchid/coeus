"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

export type HeaderMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

/**
 * Header dropdown shared by the account (avatar) and settings (⋯) triggers:
 * roving menuitem focus, Arrow/Home/End keys, Escape restoring trigger focus,
 * and outside-press dismissal.
 */
export function HeaderMenu({
  label,
  triggerLabel,
  triggerClassName,
  trigger,
  items,
}: {
  /** Accessible name of the menu itself. */
  label: string;
  /** Accessible name of the trigger button. */
  triggerLabel: string;
  triggerClassName: string;
  trigger: ReactNode;
  items: HeaderMenuItem[];
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [initialMenuItem, setInitialMenuItem] = useState<"first" | "last">("first");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const found = menuItems();
    found[initialMenuItem === "first" ? 0 : found.length - 1]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [initialMenuItem, open]);

  const openMenu = (initialItem: "first" | "last" = "first") => {
    setInitialMenuItem(initialItem);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const found = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const currentIndex = found.indexOf(document.activeElement as HTMLButtonElement);
    if (!found.length) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = currentIndex < 0 || currentIndex === found.length - 1 ? 0 : currentIndex + 1;
    if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? found.length - 1 : currentIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = found.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      found[nextIndex]?.focus();
    }
  };

  return (
    <div className="header-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>

      {open ? (
        <div className="header-dropdown" id={menuId} ref={menuRef} role="menu" aria-label={label} onKeyDown={onMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={item.danger ? "is-danger" : undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
