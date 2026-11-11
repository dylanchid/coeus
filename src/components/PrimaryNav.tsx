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

const LINKS: NavLink[] = [
  { id: "reader", href: "/", label: "Home" },
  { id: "discover", href: "/discover", label: "Discover" },
  { id: "archive", href: "/archive", label: "Archive" },
  { id: "sources", href: "/sources", label: "Sources" },
  { id: "about", href: "/about", label: "About" },
];

/** Header navigation: one contiguous run of links; search sits beside it, never inside. */
export function PrimaryNav({
  section,
  archiveCount,
}: {
  section: AppSection;
  archiveCount?: number;
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
      {LINKS.map(renderLink)}
    </nav>
  );
}
