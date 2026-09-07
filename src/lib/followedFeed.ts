import { isListable, type Viewer, type Visibility } from "./visibility.ts";

/**
 * The pure core of the Discover "Following" view (nfq.2.12): filter a set of
 * collection + post candidates through the one read gate, merge them newest
 * first, and page. The server reader (followedFeed.server.ts) supplies the
 * candidates from `collection_publications` and `posts`; this module owns the
 * visibility cut and the ordering, so both are testable with no database.
 *
 * A distinct view, not a ranking change to the Everyone feed — a filter is
 * legible and testable at this content volume; a boost is neither.
 */

export interface FollowedFeedCollection {
  kind: "collection";
  publishedAt: string;
  slug: string;
  name: string;
  description: string;
  curatorNote: string;
  attribution: string;
  itemCount: number;
}

export interface FollowedFeedPost {
  kind: "post";
  publishedAt: string;
  title: string;
  url: string;
  sourceName: string;
  author: string;
  excerpt: string;
  commentary: string;
}

export type FollowedFeedItem = FollowedFeedCollection | FollowedFeedPost;

/** One candidate plus the tier it must pass isListable at for this viewer. */
export interface FollowedFeedCandidate {
  visibility: Visibility;
  item: FollowedFeedItem;
}

export interface FollowedFeedPage {
  items: FollowedFeedItem[];
  hasMore: boolean;
}

export function combineFollowedFeed(
  candidates: readonly FollowedFeedCandidate[],
  viewer: Viewer,
  limit: number,
  offset: number
): FollowedFeedPage {
  const boundedLimit = Math.max(Math.trunc(limit), 1);
  const boundedOffset = Math.max(Math.trunc(offset), 0);

  const visible = candidates
    .filter((candidate) => isListable(candidate.visibility, viewer))
    .map((candidate) => candidate.item)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return {
    items: visible.slice(boundedOffset, boundedOffset + boundedLimit),
    hasMore: visible.length > boundedOffset + boundedLimit,
  };
}
