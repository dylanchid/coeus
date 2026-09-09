import type { Profile, ProfileLink } from "./profile.ts";
import {
  deriveInteractionFeed,
  deriveReplyThreads,
  likesSurface,
  type LikesSurface,
  type LoadedInteraction,
  type LoadedReply,
  type ProfileInteractionCard,
  type ProfileReplyThread,
} from "./conversationProfile.ts";
import {
  DEFAULT_SECTION_SWITCHES,
  visibleSections,
  type ProfileSectionSwitches,
  type VisibleSections,
} from "./profileSections.ts";
import { isListable, type Viewer, type Visibility } from "./visibility.ts";

/**
 * The public-safe boundary for the profile page. This is the profile analogue
 * of derivePublicationSnapshot() in collectionPublication.ts: the single place
 * where profile data crosses from "everything the server loaded" to "what may
 * render for this viewer".
 *
 * Pure by contract — no "server-only", no Supabase, no next import — so the
 * boundary is exhaustively testable under `node --test` with no database, the
 * same way collectionPublication.test.mjs tests its snapshot.
 *
 * Phase 2: the collections AND posts filters both go through
 * `isListable(visibility, viewer)` from src/lib/visibility.ts — the one read
 * gate. The `viewer` is the canonical four-kind `Viewer` union, resolved once
 * by the page loader (which resolves the follow relationship for the
 * `followers` tier — plan risk R5) and passed in whole.
 */

export { DEFAULT_SECTION_SWITCHES };

/** One of an owner's published collections, as loaded by
 * SupabaseProfileStore.listOwnedPublications (owner_id-indexed, no archive join). */
export interface OwnedPublication {
  id: string;
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  visibility: Visibility;
  publishedAt: string;
  updatedAt: string;
  /** Non-null once the owner has taken the collection down. */
  unpublishedAt: string | null;
  itemCount: number;
  /** Followers of this one collection (collection_follows rows). */
  followerCount: number;
}

/** One of an author's published posts, as loaded by
 * SupabasePostPublicationStore.listByAuthor (author_id-indexed). The profile
 * analogue of OwnedPublication. There is no "unpublished" state — unpublish
 * deletes the row. */
export interface OwnedPost {
  itemLocalId: string;
  title: string;
  url: string;
  sourceName: string;
  author: string;
  excerpt: string;
  commentary: string;
  visibility: Visibility;
  /** posts.created_at */
  publishedAt: string;
  /** posts.updated_at */
  updatedAt: string;
}

export interface ProfileCollectionCard {
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  visibility: Visibility;
  itemCount: number;
  publishedAt: string;
  updatedAt: string;
  /** True only on the owner view: the collection is currently taken down. */
  isUnpublished: boolean;
  /** The owner pinned this slug; the UI surfaces pinned cards first. */
  isPinned: boolean;
}

/** What a post row renders as. Deliberately carries no author id, no post
 * uuid and no itemLocalId — none of those may cross to a viewer. */
export interface ProfilePostCard {
  title: string;
  url: string;
  sourceName: string;
  author: string;
  excerpt: string;
  commentary: string;
  visibility: Visibility;
  publishedAt: string;
  updatedAt: string;
}

export interface ProfileFigures {
  /** Always equals collections.length — never a raw count that could imply a hidden row. */
  collections: number;
  /** Always equals posts.length — per-viewer filtered (design decision #11). */
  posts: number;
  /** Person-follow counts, resolved by the page loader and gated by the
   * show_followers / show_following switches at the view layer. */
  followers: number;
  following: number;
}

export interface PublicProfileView {
  handle: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  links: ProfileLink[];
  avatarUrl: string | null;
  coverUrl: string | null;
  collections: ProfileCollectionCard[];
  posts: ProfilePostCard[];
  /** Reposts this profile made, each already re-checked against its target's
   * current visibility (canSeeIndirect). Empty when show_reposts is off for a
   * visitor. */
  reposts: ProfileInteractionCard[];
  /** Likes this profile made, same indirect re-check. Empty unless
   * `likes.render` — the surface gate below folds in likes_visibility. */
  likes: ProfileInteractionCard[];
  /** Reply threads this profile is a root author of. Empty when show_replies
   * is off for a visitor. */
  replies: ProfileReplyThread[];
  /** Whether the Likes tab + sidebar strip render at all, and (owner only)
   * whether they show marked-hidden. */
  likesSurface: LikesSurface;
  /** The owner's likes_visibility tier, for the glyph on their own view. */
  likesVisibility: Visibility;
  figures: ProfileFigures;
  /** Which profile sections cross to this viewer. For a non-owner a
   * switched-off section is absent entirely; for the owner every section is
   * present, flagged `hidden` where the switch is off. */
  visibleSections: VisibleSections;
  isOwner: boolean;
}

export interface DeriveProfileOptions {
  /** This author's published posts, all tiers. The isListable cut happens here. */
  posts?: readonly OwnedPost[];
  /** The owner's stored section switches. Required so the change is coherent
   * across every caller; DEFAULT_SECTION_SWITCHES covers a profile with no row. */
  sections: ProfileSectionSwitches;
  /** Person-follower count for this profile (profile_follows). Never summed
   * from collections any more — the loader always passes the real number. */
  followers?: number;
  /** People this profile follows (profile_follows). */
  following?: number;
  /** This profile's reposts and likes, each with its target freshly joined —
   * dropped here unless canSeeIndirect() clears the target's CURRENT state. */
  reposts?: readonly LoadedInteraction[];
  likes?: readonly LoadedInteraction[];
  /** This profile's reply rows (roots + two levels of descendants). */
  replies?: readonly LoadedReply[];
  /**
   * The set of target-owner ids that THIS viewer follows — resolved once by the
   * loader across every distinct target owner in reposts/likes/replies, so the
   * `followers`-tier target check never issues a query per row.
   */
  viewerFollowsTargetOwners?: ReadonlySet<string>;
}

function isLive(publication: OwnedPublication): boolean {
  return publication.unpublishedAt === null;
}

/**
 * Does this collection belong on THIS viewer's profile listing?
 *
 *   - the owner sees every collection they have published, including ones
 *     since unpublished (rendered greyed) and unlisted ones;
 *   - everyone else sees only live collections that pass isListable — public
 *     to all, followers to a follower, unlisted to nobody in a listing.
 */
function collectionCrosses(publication: OwnedPublication, viewer: Viewer): boolean {
  if (viewer.kind === "owner") return true;
  return isLive(publication) && isListable(publication.visibility, viewer);
}

/**
 * The collection-card boundary: filter a loaded publication list to what
 * crosses to `viewer`, map to cards, and float the owner's pinned slugs to the
 * front in their declared order. Shared by {@link deriveProfileView} (the whole
 * page) and the paginated Collections tab loader, so both apply the exact same
 * visibility cut.
 */
export function deriveCollectionCards(
  publications: readonly OwnedPublication[],
  viewer: Viewer,
  pinnedSlugs: readonly string[]
): ProfileCollectionCard[] {
  const pinned = new Set(pinnedSlugs);
  const cards: ProfileCollectionCard[] = publications
    .filter((publication) => collectionCrosses(publication, viewer))
    .map((publication) => ({
      slug: publication.slug,
      name: publication.name,
      description: publication.description,
      curatorNote: publication.curatorNote,
      visibility: publication.visibility,
      itemCount: publication.itemCount,
      publishedAt: publication.publishedAt,
      updatedAt: publication.updatedAt,
      isUnpublished: !isLive(publication),
      isPinned: pinned.has(publication.slug),
    }));

  // Pinned cards first, in the owner's declared pin order; then the rest in
  // the incoming (newest-first) order. A stable sort keeps the tail intact.
  const pinOrder = new Map(pinnedSlugs.map((slug, index) => [slug, index]));
  return cards.slice().sort((a, b) => {
    const ai = a.isPinned ? pinOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bi = b.isPinned ? pinOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return 0;
  });
}

/** The post-card boundary: filter a loaded post list to what is listable for
 * `viewer` and map to cards. Shared by the whole page and the paginated Posts
 * tab loader. */
export function derivePostCards(
  posts: readonly OwnedPost[],
  viewer: Viewer
): ProfilePostCard[] {
  return posts
    .filter((post) => isListable(post.visibility, viewer))
    .map((post) => ({
      title: post.title,
      url: post.url,
      sourceName: post.sourceName,
      author: post.author,
      excerpt: post.excerpt,
      commentary: post.commentary,
      visibility: post.visibility,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    }));
}

export function deriveProfileView(
  profile: Profile,
  publications: readonly OwnedPublication[],
  viewer: Viewer,
  options: DeriveProfileOptions
): PublicProfileView {
  const isOwner = viewer.kind === "owner";

  const collections = deriveCollectionCards(publications, viewer, profile.pinnedCollectionSlugs);

  const switches = options.sections;
  const follows = options.viewerFollowsTargetOwners ?? new Set<string>();
  const followsOwner = (ownerId: string) => follows.has(ownerId);

  const surface = likesSurface(switches, viewer);
  const reposts = switches.showReposts || isOwner
    ? deriveInteractionFeed(options.reposts ?? [], viewer, followsOwner)
    : [];
  const likes = surface.render
    ? deriveInteractionFeed(options.likes ?? [], viewer, followsOwner)
    : [];
  const replies = switches.showReplies || isOwner
    ? deriveReplyThreads(options.replies ?? [], viewer, followsOwner)
    : [];

  const posts = derivePostCards(options.posts ?? [], viewer);

  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    links: profile.links,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    collections,
    posts,
    reposts,
    likes,
    replies,
    likesSurface: surface,
    likesVisibility: switches.likesVisibility as Visibility,
    figures: {
      // The rule: a figure equals the length of what actually crossed the
      // boundary, so a number can never imply a row this viewer cannot reach.
      collections: collections.length,
      posts: posts.length,
      followers: Math.max(0, Math.trunc(options.followers ?? 0)),
      following: Math.max(0, Math.trunc(options.following ?? 0)),
    },
    visibleSections: visibleSections(options.sections, { isOwner }),
    isOwner,
  };
}
