import Link from "next/link";
import { avatarInitials } from "@/lib/profileMedia";
import type { FollowedProfile } from "@/lib/profileFollow";
import type { FollowDirection } from "@/lib/followListPage.server";

/**
 * The followers / following list surface. Server component, zero client JS.
 * Pagination is forward-only over a created_at cursor rendered as `?cursor=`
 * links — real URLs, no client state. Followers with no profile row were
 * already dropped by the store, so `count` and the rendered rows agree.
 */
export function ProfileFollowList({
  handle,
  direction,
  isOwner,
  hiddenFromProfile,
  count,
  items,
  hasMore,
  nextCursor,
  onCursor,
}: {
  handle: string;
  direction: FollowDirection;
  isOwner: boolean;
  hiddenFromProfile: boolean;
  count: number;
  items: FollowedProfile[];
  hasMore: boolean;
  nextCursor: string | null;
  /** True when the current view is a cursor page (not the first page). */
  onCursor: boolean;
}) {
  const base = `/@${handle}/${direction}`;
  const heading =
    direction === "followers"
      ? `${count} ${count === 1 ? "follower" : "followers"}`
      : `Following ${count}`;
  const emptyMessage =
    direction === "followers"
      ? isOwner
        ? "Nobody follows you yet."
        : `Nobody follows @${handle} yet.`
      : isOwner
        ? "You aren’t following anyone yet."
        : `@${handle} isn’t following anyone yet.`;

  return (
    <div className="profile-page">
      <header className="follow-list-head">
        <p className="archive-eyebrow">
          <Link href={`/@${handle}`}>@{handle}</Link>
        </p>
        <h1>{heading}</h1>
        {isOwner && hiddenFromProfile ? (
          <p className="follow-list-hidden" role="note">
            Hidden from your profile — only you can see this list.
          </p>
        ) : null}
      </header>

      {items.length ? (
        <ul className="follow-list">
          {items.map((person) => (
            <li key={person.id} className="follow-list-row">
              <Link href={`/@${person.handle}`} className="follow-list-link">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded Supabase Storage URL, deliberately not routed through the optimizer
                  <img className="follow-list-avatar" src={person.avatarUrl} alt="" aria-hidden="true" />
                ) : (
                  <span className="follow-list-avatar-fallback" aria-hidden="true">
                    {avatarInitials(person.displayName)}
                  </span>
                )}
                <span className="follow-list-identity">
                  <strong>{person.displayName}</strong>
                  <span className="follow-list-handle">@{person.handle}</span>
                  {person.bio ? <span className="follow-list-bio">{person.bio}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="profile-feed-empty">{emptyMessage}</p>
      )}

      <nav className="follow-list-pagination" aria-label="Pagination">
        {onCursor ? <Link href={base}>← Newest</Link> : <span />}
        {hasMore && nextCursor ? <Link href={`${base}?cursor=${encodeURIComponent(nextCursor)}`}>Older →</Link> : null}
      </nav>
    </div>
  );
}
