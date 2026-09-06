import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import type { ProfileTabId } from "@/lib/profileTabs";
import type { PublicProfileView } from "@/lib/publicProfile";

const OVERVIEW_LIMIT = 4;

/** Composes the whole read-only profile surface. All viewer filtering already
 * happened in deriveProfileView(); this only lays the pieces out. The one
 * client island — ProfileEditor — mounts only for the owner. */
export function ProfileView({
  view,
  tab,
  openEditor = false,
}: {
  view: PublicProfileView;
  tab: ProfileTabId;
  openEditor?: boolean;
}) {
  const emptyMessage = view.isOwner
    ? "You haven’t published any collections yet."
    : `@${view.handle} hasn’t published any collections yet.`;

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs handle={view.handle} current={tab} isOwner={view.isOwner} />

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

        <ProfileSidebar view={view} />
      </div>
    </div>
  );
}
