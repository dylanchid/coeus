import Link from "next/link";
import { profileTabs, type ProfileTabId } from "@/lib/profileTabs";

/**
 * The tab + actions row under the banner. Tabs are real links carrying `?tab=`
 * (not role=tablist — this is navigation, not in-page panels), so switching
 * tabs is a server render with no client navigation required.
 *
 * The owner gets an "Edit profile" affordance here; Phase 1 has no person
 * graph, so a visitor gets no Follow button (it arrives in Phase 2).
 */
export function ProfileTabs({
  handle,
  current,
  isOwner,
}: {
  handle: string;
  current: ProfileTabId;
  isOwner: boolean;
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
      ) : null}
    </nav>
  );
}
