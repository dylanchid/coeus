import Link from "next/link";
import { ExternalLinkHint } from "./ExternalLinkHint";
import type { FollowedFeedItem } from "@/lib/followedFeed";

/**
 * The Discover "Following" view feed: collections and posts from people the
 * viewer follows, already filtered through isListable() by the server reader
 * (SupabaseFollowedFeedReader) with the viewer as a follower of every author.
 * Server component, offset pagination via `?view=following&offset=`.
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
          : "The people you follow haven’t published anything you can see yet. Follow more curators from their profiles."}
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
                {item.itemCount} {item.itemCount === 1 ? "piece" : "pieces"}
                {item.attribution ? ` — ${item.attribution}` : ""}
              </p>
            </li>
          ) : (
            <li className="following-feed-item" key={`p-${item.url}-${item.publishedAt}`}>
              <p className="following-feed-kind">Post</p>
              {item.commentary ? <blockquote className="profile-post-commentary">{item.commentary}</blockquote> : null}
              <a className="profile-post-source" href={item.url} target="_blank" rel="noreferrer">
                {item.sourceName ? <span className="profile-post-source-name">{item.sourceName}</span> : null}
                <strong>{item.title}</strong>
                {item.author ? <small>{item.author}</small> : null}
                {item.excerpt ? <span className="profile-post-excerpt">{item.excerpt}</span> : null}
                <ExternalLinkHint />
              </a>
            </li>
          )
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
