import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import { ProfileFeedPagination } from "./ProfileFeedPagination";
import type { ProfileTabId } from "@/lib/profiles/profileTabs";
import type { ProfileSectionSwitches } from "@/lib/profiles/profileSections";
import type { ProfileCollectionCard, PublicProfileView } from "@/lib/profiles/publicProfile";

/** One cursor page of a paginated tab feed, resolved by the page for the
 * active Collections tab. `cards` is already viewer-filtered. */
export interface ProfileFeedSlice<Card> {
  cards: Card[];
  hasMore: boolean;
  nextCursor: string | null;
}

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
  paginatedCollections = null,
  onCursor = false,
}: {
  view: PublicProfileView;
  tab: ProfileTabId;
  /** Non-null only for a signed-in non-owner. */
  follow?: ProfileFollowContext | null;
  /** The owner's stored switches, for the SectionSwitches island. Null for a visitor. */
  sectionSwitches?: ProfileSectionSwitches | null;
  openEditor?: boolean;
  /** Cursor page for the Collections tab. Null ⇒ render the unpaginated list. */
  paginatedCollections?: ProfileFeedSlice<ProfileCollectionCard> | null;
  /** True when the active tab is showing a cursor page, not its first page. */
  onCursor?: boolean;
}) {
  const { isOwner } = view;
  const emptyMessage = isOwner
    ? "You haven’t published any collections yet."
    : `@${view.handle} hasn’t published any collections yet.`;

  const activeTab: ProfileTabId = tab === "collections" ? "collections" : "overview";

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs handle={view.handle} current={activeTab} isOwner={isOwner} follow={follow} tabStates={{}} />

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
          {activeTab === "collections" ? (
            <>
              <ProfileCollections
                cards={paginatedCollections ? paginatedCollections.cards : view.collections}
                emptyMessage={emptyMessage}
              />
              {paginatedCollections ? (
                <ProfileFeedPagination
                  tab="collections"
                  handle={view.handle}
                  hasMore={paginatedCollections.hasMore}
                  nextCursor={paginatedCollections.nextCursor}
                  onCursor={onCursor}
                />
              ) : null}
            </>
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