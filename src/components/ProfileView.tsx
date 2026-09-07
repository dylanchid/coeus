import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfilePosts } from "./ProfilePosts";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import type { PostsTabState, ProfileTabId } from "@/lib/profileTabs";
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

  // The Posts tab: a normal link once there is something to see; greyed for the
  // owner who has published nothing; absent entirely for a visitor with nothing.
  const postsTab: PostsTabState = view.posts.length ? "visible" : view.isOwner ? "greyed" : "hidden";
  // An unknown or hidden ?tab=posts falls back to the overview column.
  const activeTab: ProfileTabId = tab === "posts" && postsTab === "hidden" ? "overview" : tab;

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs
        handle={view.handle}
        current={activeTab}
        isOwner={view.isOwner}
        follow={follow}
        posts={postsTab}
      />

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
          {activeTab === "posts" ? (
            <ProfilePosts posts={view.posts} isOwner={view.isOwner} handle={view.handle} />
          ) : activeTab === "collections" ? (
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
