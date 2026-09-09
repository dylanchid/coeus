import Link from "next/link";

/**
 * Forward-only pagination for the profile Collections and Posts tabs. Same
 * shape as the followers / following list nav: real `?cursor=` links, no client
 * state, "← Newest" back to the first page and "Older →" to the next. Rendered
 * under the feed column on the dedicated tab only — never on Overview.
 */
export function ProfileFeedPagination({
  tab,
  handle,
  hasMore,
  nextCursor,
  onCursor,
}: {
  tab: "collections" | "posts";
  handle: string;
  hasMore: boolean;
  nextCursor: string | null;
  /** True when the current view is a cursor page (not the first page). */
  onCursor: boolean;
}) {
  if (!onCursor && !(hasMore && nextCursor)) return null;

  const base = `/@${handle}?tab=${tab}`;
  return (
    <nav className="profile-feed-pagination" aria-label="Pagination">
      {onCursor ? <Link href={base}>← Newest</Link> : <span />}
      {hasMore && nextCursor ? (
        <Link href={`${base}&cursor=${encodeURIComponent(nextCursor)}`}>Older →</Link>
      ) : null}
    </nav>
  );
}
