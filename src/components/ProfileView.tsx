import Link from "next/link";
import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import { ProfileFeedPagination } from "./ProfileFeedPagination";
import type { ProfileTabId } from "@/lib/profiles/profileTabs";
import type { ProfileSectionSwitches } from "@/lib/profiles/profileSections";
import type { ProfileCollectionCard, PublicProfileView } from "@/lib/profiles/publicProfile";

/** One cursor page of the profile shelf. */
export interface ProfileFeedSlice<Card> {
  cards: Card[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Follow relationship for a signed-in non-owner (profile UUID stays out of the view). */
export interface ProfileFollowContext {
  profileId: string;
  initialFollowing: boolean;
}

/** Profile shelf surface: banner, action row, collection index, sidebar. */
export function ProfileView({
  view,
  tab,
  follow = null,
  sectionSwitches = null,
  openEditor = false,
  paginatedCollections,
  onCursor = false,
}: {
  view: PublicProfileView;
  /** Legacy alias: `?tab=collections` matches the default shelf. */
  tab: ProfileTabId;
  follow?: ProfileFollowContext | null;
  sectionSwitches?: ProfileSectionSwitches | null;
  openEditor?: boolean;
  paginatedCollections: ProfileFeedSlice<ProfileCollectionCard>;
  onCursor?: boolean;
}) {
  const { isOwner } = view;
  const emptyMessage = `@${view.handle} is putting together a first collection.`;
  const emptyAction = isOwner ? (
    <p className="profile-feed-empty">
      <Link href="/archive">Publish your first collection →</Link>
    </p>
  ) : null;

  const shelfCards = paginatedCollections.cards;
  const paginationTab = tab === "collections" ? "collections" : "collections";

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs handle={view.handle} isOwner={isOwner} follow={follow} />

      {isOwner ? (
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
          <ProfileCollections
            cards={shelfCards}
            emptyMessage={emptyMessage}
            emptyAction={emptyAction}
          />
          <ProfileFeedPagination
            tab={paginationTab}
            handle={view.handle}
            hasMore={paginatedCollections.hasMore}
            nextCursor={paginatedCollections.nextCursor}
            onCursor={onCursor}
          />
        </div>

        <ProfileSidebar view={view} sectionSwitches={sectionSwitches} />
      </div>
    </div>
  );
}