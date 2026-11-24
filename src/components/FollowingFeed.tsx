import Link from "next/link";
import { FollowButton } from "./FollowButton";
import type { FollowedFeedItem } from "@/lib/feeds/followedFeed";

/**
 * The Discover "Following" view feed: published collections from people the
 * viewer follows, filtered through isListable() on the server reader.
 */
export function FollowingFeed({
  items,
  hasMore,
  offset,
  pageSize,
}: {
  items: FollowedFeedItem[];
  hasMore: boolean;
  offset: number;
  pageSize: number;
}) {
  if (!items.length) {
    return (
      <p className="discover-following-empty">
        {offset > 0
          ? "Nothing more from the people you follow."
          : "The people you follow haven’t published a collection you can see yet. Follow more curators from their profiles."}
      </p>
    );
  }

  return (
    <>
      <ol className="following-feed">
        {items.map((item) =>
          item.kind === "collection" ? (
            <li className="following-feed-item" key={`c-${item.slug}`}>
              <p className="following-feed-kind">Collection</p>
              <h3>
                <Link href={`/c/${item.slug}`}>{item.name}</Link>
              </h3>
              {item.description ? <p>{item.description}</p> : null}
              <p className="following-feed-meta">
                {item.itemCount} {item.itemCount === 1 ? "entry" : "entries"}
                {item.attribution ? ` — ${item.attribution}` : ""}
              </p>
              {item.publicationId ? (
                <FollowButton
                  publicationId={item.publicationId}
                  slug={item.slug}
                  name={item.name}
                  curatorHandle={item.curatorHandle}
                />
              ) : null}
            </li>
          ) : null
        )}
      </ol>
      <nav className="follow-list-pagination" aria-label="Pagination">
        {offset > 0 ? (
          <Link href={`/discover?view=following&offset=${Math.max(offset - pageSize, 0)}`}>← Newer</Link>
        ) : (
          <span />
        )}
        {hasMore ? <Link href={`/discover?view=following&offset=${offset + pageSize}`}>Older →</Link> : null}
      </nav>
    </>
  );
}