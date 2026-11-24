import Link from "next/link";
import { CopyLinkButton } from "./CopyLinkButton";
import { ProfileFollowButton } from "./ProfileFollowButton";
import type { ProfileFollowContext } from "./ProfileView";

/**
 * Profile action row: edit, follow, RSS, and copy link. Replaces the old tab nav;
 * the shelf is the only profile view.
 */
export function ProfileTabs({
  handle,
  isOwner,
  follow = null,
}: {
  handle: string;
  isOwner: boolean;
  follow?: ProfileFollowContext | null;
}) {
  const profileUrl = `/@${handle}`;
  const rssHref = `/@${handle}/rss.xml`;

  return (
    <nav className="profile-actions-row" aria-label="Profile actions">
      {isOwner ? (
        <Link className="profile-action" href={`/@${handle}?edit=1`}>
          Edit profile
        </Link>
      ) : follow ? (
        <ProfileFollowButton
          profileId={follow.profileId}
          handle={handle}
          initialFollowing={follow.initialFollowing}
        />
      ) : (
        <Link
          className="follow-control follow-control--secondary"
          href={`/signin?next=${encodeURIComponent(profileUrl)}`}
        >
          Follow @{handle}
        </Link>
      )}
      <a className="follow-control follow-control--secondary" href={rssHref}>
        RSS ↗
      </a>
      <CopyLinkButton url={profileUrl} className="follow-control follow-control--secondary" />
    </nav>
  );
}