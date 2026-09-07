import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import type { ProfileTabId } from "@/lib/profileTabs";
import type { ProfileSectionSwitches } from "@/lib/profileSections";
import type { PublicProfileView } from "@/lib/publicProfile";

const OVERVIEW_LIMIT = 4;

/** The follow relationship, resolved by the page for a signed-in non-owner.
 * Carries `profileId` (a profiles.id UUID) as a sibling of `view` so it never
 * enters PublicProfileView — the load-bearing "no id crosses" invariant. */
export interface ProfileFollowContext {
  profileId: string;
  initialFollowing: boolean;
}

/** Composes the whole read-only profile surface. All viewer filtering already
 * happened in deriveProfileView(); this only lays the pieces out. The client
 * islands — ProfileEditor (owner), ProfileFollowButton (visitor),
 * SectionSwitches (owner) — mount from here. */
export function ProfileView({
  view,
  tab,
  follow = null,
  sectionSwitches = null,
  openEditor = false,
}: {
  view: PublicProfileView;
  tab: ProfileTabId;
  /** Non-null only for a signed-in non-owner. */
  follow?: ProfileFollowContext | null;
  /** The owner's stored switches, for the SectionSwitches island. Null for a visitor. */
  sectionSwitches?: ProfileSectionSwitches | null;
  openEditor?: boolean;
}) {
  const emptyMessage = view.isOwner
    ? "You haven’t published any collections yet."
    : `@${view.handle} hasn’t published any collections yet.`;

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs handle={view.handle} current={tab} isOwner={view.isOwner} follow={follow} />

      {view.isOwner ? (
        <div className="profile-editor-slot">
          <ProfileEditorMount
            handle={view.handle}
            displayName={view.displayName}
            bio={view.bio}
            location={view.location}
            links={view.links}
            avatarUrl={view.avatarUrl}
            coverUrl={view.coverUrl}
            defaultOpen={openEditor}
          />
        </div>
      ) : null}

      <div className="profile-body">
        <div className="profile-feed">
          {tab === "collections" ? (
            <ProfileCollections cards={view.collections} emptyMessage={emptyMessage} />
          ) : (
            <ProfileCollections
              cards={view.collections}
              heading={view.collections.length > OVERVIEW_LIMIT ? "Recent collections" : undefined}
              limit={OVERVIEW_LIMIT}
              emptyMessage={emptyMessage}
            />
          )}
        </div>

        <ProfileSidebar view={view} sectionSwitches={sectionSwitches} />
      </div>
    </div>
  );
}
