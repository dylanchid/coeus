import type { Profile, ProfileLink } from "./profile.ts";

/**
 * The public-safe boundary for the profile page. This is the profile analogue
 * of derivePublicationSnapshot() in collectionPublication.ts: the single place
 * where profile data crosses from "everything the server loaded" to "what may
 * render for this viewer".
 *
 * Pure by contract — no "server-only", no Supabase, no next import — so the
 * boundary is exhaustively testable under `node --test` with no database, the
 * same way collectionPublication.test.mjs tests its snapshot.
 */

export type PublicationVisibility = "unlisted" | "public";

/** One of an owner's published collections, as loaded by
 * SupabaseProfileStore.listOwnedPublications (owner_id-indexed, no archive join). */
export interface OwnedPublication {
  id: string;
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  visibility: PublicationVisibility;
  publishedAt: string;
  updatedAt: string;
  /** Non-null once the owner has taken the collection down. */
  unpublishedAt: string | null;
  itemCount: number;
  /** Followers of this one collection (collection_follows rows). */
  followerCount: number;
}

/** Who is looking. An explicit argument, never an ambient lookup, so an
 * owner-only row is a deliberate input rather than a filter someone forgot. */
export interface ProfileViewer {
  isOwner: boolean;
}

export interface ProfileCollectionCard {
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  visibility: PublicationVisibility;
  itemCount: number;
  publishedAt: string;
  updatedAt: string;
  /** True only on the owner view: the collection is currently taken down. */
  isUnpublished: boolean;
  /** The owner pinned this slug; the UI surfaces pinned cards first. */
  isPinned: boolean;
}

export interface ProfileFigures {
  /** Always equals collections.length — never a raw count that could imply a hidden row. */
  collections: number;
  posts: number;
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
  figures: ProfileFigures;
  isOwner: boolean;
}

export interface DeriveProfileOptions {
  /** Collection followers — an aggregate over this owner's collection_follows.
   * Phase 1 labels the Followers figure as "collection followers"; Phase 2
   * swaps it for person-follows. When omitted, it is summed from the live
   * publications passed in. */
  followers?: number;
  /** People / collections this owner follows. Phase 1 has no person graph, so
   * the route passes 0 or a collection-follow count. */
  following?: number;
}

function isLive(publication: OwnedPublication): boolean {
  return publication.unpublishedAt === null;
}

/**
 * Decide whether a publication belongs on THIS viewer's profile listing.
 *
 * Phase 2 replaces this with `isListable(visibility, viewer)` from
 * src/lib/visibility.ts. Until then:
 *   - the owner sees every collection they have published, including ones
 *     since unpublished (rendered greyed);
 *   - a visitor sees only live, public collections. `unlisted` stays reachable
 *     by direct /c/<slug> link but never appears in a listing — the same rule
 *     the Discover listing already applies.
 */
function crossesFor(publication: OwnedPublication, viewer: ProfileViewer): boolean {
  if (viewer.isOwner) return true;
  return isLive(publication) && publication.visibility === "public";
}

export function deriveProfileView(
  profile: Profile,
  publications: readonly OwnedPublication[],
  viewer: ProfileViewer,
  options: DeriveProfileOptions = {}
): PublicProfileView {
  const followers =
    options.followers ??
    publications.reduce((total, publication) => (isLive(publication) ? total + publication.followerCount : total), 0);

  const pinned = new Set(profile.pinnedCollectionSlugs);

  const cards: ProfileCollectionCard[] = publications
    .filter((publication) => crossesFor(publication, viewer))
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
  // the incoming (newest-first) order.
  const pinOrder = new Map(profile.pinnedCollectionSlugs.map((slug, index) => [slug, index]));
  const collections = cards.slice().sort((a, b) => {
    const ai = a.isPinned ? pinOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bi = b.isPinned ? pinOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return 0;
  });

  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location,
    links: profile.links,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    collections,
    figures: {
      // The rule: a figure equals the length of what actually crossed the
      // boundary, so a number can never imply a row this viewer cannot reach.
      collections: collections.length,
      posts: 0, // Phase 2 introduces posts.
      followers: Math.max(0, Math.trunc(followers)),
      following: Math.max(0, Math.trunc(options.following ?? 0)),
    },
    isOwner: viewer.isOwner,
  };
}
