import Link from "next/link";

export type AppSection = "reader" | "sources" | "discover" | "archive" | "about";

export const SECTION_LABELS: Record<AppSection, string> = {
  reader: "Reader",
  sources: "Sources",
  discover: "Discover",
  archive: "Archive",
  about: "About",
};

const LINKS: { id: AppSection; href: string; label: string }[] = [
  { id: "reader", href: "/", label: "Read" },
  { id: "sources", href: "/sources", label: "Sources" },
  { id: "discover", href: "/discover", label: "Discover" },
  { id: "archive", href: "/archive", label: "Archive" },
  { id: "about", href: "/about", label: "About" },
];

export function PrimaryNav({
  section,
  archiveCount,
}: {
  section: AppSection;
  archiveCount?: number;
}) {
  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {LINKS.map((link) => (
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
      ))}
    </nav>
  );
}
