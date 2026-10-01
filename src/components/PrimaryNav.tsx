import type { ReactNode } from "react";
import Link from "next/link";

export type AppSection = "reader" | "sources" | "discover" | "archive" | "about" | "account";

export const SECTION_LABELS: Record<AppSection, string> = {
  reader: "Reader",
  sources: "Sources",
  discover: "Discover",
  archive: "Archive",
  about: "About",
  account: "Account",
};

type NavLink = { id: AppSection; href: string; label: string };

const LINKS_BEFORE_SEARCH: NavLink[] = [
  { id: "reader", href: "/", label: "Home" },
  { id: "discover", href: "/discover", label: "Discover" },
  { id: "archive", href: "/archive", label: "Archive" },
];

const LINKS_AFTER_SEARCH: NavLink[] = [
  { id: "sources", href: "/sources", label: "Sources" },
  { id: "about", href: "/about", label: "About" },
];

/**
 * Header navigation: Home · Discover · Archive, then the search box (passed as
 * `search`), then Sources · About.
 */
export function PrimaryNav({
  section,
  archiveCount,
  search,
}: {
  section: AppSection;
  archiveCount?: number;
  search?: ReactNode;
}) {
  const renderLink = (link: NavLink) => (
    <Link
      className="primary-nav-link"
      href={link.href}
      key={link.id}
      aria-current={link.id === section ? "page" : undefined}
    >
      {link.label}
      {link.id === "archive" && archiveCount ? (
        <span className="nav-count">{archiveCount}</span>
      ) : null}
    </Link>
  );

  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {LINKS_BEFORE_SEARCH.map(renderLink)}
      {search}
      {LINKS_AFTER_SEARCH.map(renderLink)}
    </nav>
  );
}
