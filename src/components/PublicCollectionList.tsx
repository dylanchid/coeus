import type { ReactNode } from "react";
import Link from "next/link";

export type PublicCollectionListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  attribution: string;
  itemCount: number;
};

/**
 * The real, server-backed list of published collections, shared by `/c` and
 * the Discover "Everyone" view so both always show the same inventory.
 * `pageHref(offset)` builds pagination links for whichever route renders it.
 */
export function PublicCollectionList({
  items,
  hasMore,
  offset,
  pageSize,
  pageHref,
  empty,
}: {
  items: PublicCollectionListItem[];
  hasMore: boolean;
  offset: number;
  pageSize: number;
  pageHref: (offset: number) => string;
  empty: ReactNode;
}) {
  return (
    <>
      {items.length ? (
        <ol className="public-collection-list">
          {items.map((item) => (
            <li key={item.id}>
              <h2><Link href={`/c/${item.slug}`}>{item.name}</Link></h2>
              <p className="public-collection-meta">
                {item.itemCount} {item.itemCount === 1 ? "piece" : "pieces"}
                {item.attribution ? ` — ${item.attribution}` : ""}
              </p>
              {item.description ? <p>{item.description}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="public-collection-empty">{empty}</div>
      )}
      <nav className="public-collection-pagination" aria-label="Pagination">
        {offset > 0 ? <Link href={pageHref(Math.max(offset - pageSize, 0))}>← Newer</Link> : <span />}
        {hasMore ? <Link href={pageHref(offset + pageSize)}>Older →</Link> : null}
      </nav>
    </>
  );
}

/** The empty state both routes share: say what's true, then the next step. */
export function NoPublicCollectionsYet() {
  return (
    <>
      <p>No one has published a collection yet.</p>
      <p>
        Collections start in your <Link href="/archive">Archive</Link>: save pieces from the{" "}
        <Link href="/">Reader</Link>, group them into a collection, then publish it to get a stable link and an
        RSS feed anyone can follow.
      </p>
    </>
  );
}
