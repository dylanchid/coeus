import Link from "next/link";
import { profileTabs, type ProfileTabId } from "@/lib/profileTabs";
import { ProfileFollowButton } from "./ProfileFollowButton";
import type { ProfileFollowContext } from "./ProfileView";

/**
 * The tab + actions row under the banner. Tabs are real links carrying `?tab=`
 * (not role=tablist — this is navigation, not in-page panels), so switching
 * tabs is a server render with no client navigation required.
 *
 * The actions slot holds the owner's "Edit profile" link, or — for a signed-in
 * non-owner — the Follow button, seeded with `initialFollowing` from the server
 * so it is correct at first paint (plan risk R5).
 */
export function ProfileTabs({
  handle,
  current,
  isOwner,
  follow = null,
}: {
  handle: string;
  current: ProfileTabId;
  isOwner: boolean;
  follow?: ProfileFollowContext | null;
}) {
  return (
    <nav className="profile-tabs" aria-label="Profile sections">
      {profileTabs(handle, current).map((tab) => (
        <Link
          key={tab.id}
          className="profile-tab"
          href={tab.href}
          aria-current={tab.current ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
      {isOwner ? (
        <span className="profile-actions">
          <Link className="profile-action" href={`/@${handle}?edit=1`}>
            Edit profile
          </Link>
        </span>
      ) : follow ? (
        <span className="profile-actions">
          <ProfileFollowButton
            profileId={follow.profileId}
            handle={handle}
            initialFollowing={follow.initialFollowing}
          />
        </span>
      ) : null}
    </nav>
  );
}
