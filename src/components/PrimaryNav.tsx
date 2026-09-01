import Link from "next/link";

type AppSection = "reader" | "discover" | "archive" | "social" | "product";

const LINKS: { id: AppSection; href: string; label: string }[] = [
  { id: "reader", href: "/", label: "Read" },
  { id: "discover", href: "/discover", label: "Discover" },
  { id: "archive", href: "/archive", label: "Archive" },
  { id: "social", href: "/social", label: "Social" },
  { id: "product", href: "/product", label: "Product" },
];

export function PrimaryNav({
  current,
  archiveCount,
  readerStyle = false,
}: {
  current: AppSection;
  archiveCount?: number;
  readerStyle?: boolean;
}) {
  return (
    <nav className={readerStyle ? "reader-primary-nav" : undefined} aria-label="Primary navigation">
      {LINKS.filter((link) => !readerStyle || link.id !== current).map((link) => (
        <Link
          className={readerStyle ? "product-link" : undefined}
          href={link.href}
          key={link.id}
          aria-current={link.id === current ? "page" : undefined}
        >
          {link.label}
          {link.id === "archive" && archiveCount !== undefined ? (
            <> <span className="archive-count">{archiveCount}</span></>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
