import { ProfileBanner } from "./ProfileBanner";
import { ProfileCollections } from "./ProfileCollections";
import { ProfileEditorMount } from "./ProfileEditor";
import { ProfileInteractions } from "./ProfileInteractions";
import { ProfilePosts } from "./ProfilePosts";
import { ProfileReplies, type ReplyComposeTarget } from "./ProfileReplies";
import { ProfileSidebar } from "./ProfileSidebar";
import { ProfileTabs } from "./ProfileTabs";
import { ProfileFeedPagination } from "./ProfileFeedPagination";
import type { ProfileTabId, ProfileTabStates, TabState } from "@/lib/profileTabs";
import type { ProfileSectionSwitches } from "@/lib/profileSections";
import type { ProfileCollectionCard, ProfilePostCard, PublicProfileView } from "@/lib/publicProfile";

/** One cursor page of a paginated tab feed, resolved by the page for the
 * active Collections / Posts tab. `cards` is already viewer-filtered. */
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

/**
 * The three-state rule shared by every conditional tab: a link when there is
 * something to see, plain text for the owner who has nothing there yet, absent
 * for anyone else. `available` folds in the section switch / visibility gate
 * that deriveProfileView already applied (an empty list means "not available"
 * to a visitor).
 */
function tabState(count: number, isOwner: boolean, available: boolean): TabState {
  if (count > 0) return "visible";
  if (isOwner && available) return "greyed";
  return "hidden";
}

/** Composes the whole read-only profile surface. All viewer filtering already
 * happened in deriveProfileView(); this only lays the pieces out. The client
 * islands — ProfileEditor (owner), ProfileFollowButton (visitor),
 * SectionSwitches (owner), ReplyComposer — mount from here. */
export function ProfileView({
  view,
  tab,
  follow = null,
  sectionSwitches = null,
  openEditor = false,
  replyComposeTargets = {},
  paginatedCollections = null,
  paginatedPosts = null,
  onCursor = false,
}: {
  view: PublicProfileView;
  tab: ProfileTabId;
  /** Non-null only for a signed-in non-owner. */
  follow?: ProfileFollowContext | null;
  /** The owner's stored switches, for the SectionSwitches island. Null for a visitor. */
  sectionSwitches?: ProfileSectionSwitches | null;
  openEditor?: boolean;
  /** Owner-only: per-thread compose targets, keyed by thread-root reply id. */
  replyComposeTargets?: Record<string, ReplyComposeTarget>;
  /** Cursor page for the Collections tab. Null ⇒ render the unpaginated list. */
  paginatedCollections?: ProfileFeedSlice<ProfileCollectionCard> | null;
  /** Cursor page for the Posts tab. */
  paginatedPosts?: ProfileFeedSlice<ProfilePostCard> | null;
  /** True when the active tab is showing a cursor page, not its first page. */
  onCursor?: boolean;
}) {
  const { isOwner } = view;
  const emptyMessage = isOwner
    ? "You haven’t published any collections yet."
    : `@${view.handle} hasn’t published any collections yet.`;

  const tabStates: ProfileTabStates = {
    posts: tabState(view.posts.length, isOwner, true),
    reposts: tabState(view.reposts.length, isOwner, Boolean(view.visibleSections.reposts)),
    replies: tabState(view.replies.length, isOwner, Boolean(view.visibleSections.replies)),
    likes: tabState(view.likes.length, isOwner, view.likesSurface.render),
  };

  // An unknown or hidden ?tab= falls back to the overview column.
  const requested = tab as keyof ProfileTabStates;
  const activeTab: ProfileTabId =
    requested in tabStates && tabStates[requested] === "hidden" ? "overview" : tab;

  return (
    <div className="profile-page">
      <ProfileBanner view={view} />
      <ProfileTabs
        handle={view.handle}
        current={activeTab}
        isOwner={isOwner}
        follow={follow}
        tabStates={tabStates}
      />

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
          {activeTab === "posts" ? (
            <>
              <ProfilePosts
                posts={paginatedPosts ? paginatedPosts.cards : view.posts}
                isOwner={isOwner}
                handle={view.handle}
              />
              {paginatedPosts ? (
                <ProfileFeedPagination
                  tab="posts"
                  handle={view.handle}
                  hasMore={paginatedPosts.hasMore}
                  nextCursor={paginatedPosts.nextCursor}
                  onCursor={onCursor}
                />
              ) : null}
            </>
          ) : activeTab === "reposts" ? (
            <ProfileInteractions
              cards={view.reposts}
              kind="reposts"
              isOwner={isOwner}
              handle={view.handle}
            />
          ) : activeTab === "likes" ? (
            <ProfileInteractions
              cards={view.likes}
              kind="likes"
              isOwner={isOwner}
              handle={view.handle}
            />
          ) : activeTab === "replies" ? (
            <ProfileReplies
              threads={view.replies}
              isOwner={isOwner}
              handle={view.handle}
              composeTargets={replyComposeTargets}
            />
          ) : activeTab === "collections" ? (
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
