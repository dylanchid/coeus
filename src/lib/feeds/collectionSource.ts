import { isValidSlug } from "../publications/collectionPublication.ts";
import type { SourceDef, UserPrefs } from "../types.ts";

export const COLLECTION_SOURCE_PREFIX = "c:";
export const COLLECTION_SOURCE_TAG = "coeus-collection";

export function isCollectionSourceId(id: string): boolean {
  return parseCollectionSourceId(id) !== null;
}

export function collectionSourceId(slug: string): string {
  return `${COLLECTION_SOURCE_PREFIX}${slug}`;
}

export function parseCollectionSourceId(id: string): string | null {
  if (!id.startsWith(COLLECTION_SOURCE_PREFIX)) return null;
  const slug = id.slice(COLLECTION_SOURCE_PREFIX.length);
  return isValidSlug(slug) ? slug : null;
}

export function collectionFeedUrls(slug: string): { feedUrl: string; homeUrl: string } {
  return { feedUrl: `/c/${slug}/rss.xml`, homeUrl: `/c/${slug}` };
}

export function collectionSourceColumnName(name: string, curatorHandle?: string): string {
  return curatorHandle ? `${name} · @${curatorHandle}` : name;
}

/** Build a Reader source for a followed published collection. */
export function buildCollectionSourceDef(input: {
  slug: string;
  name: string;
  curatorHandle?: string;
}): SourceDef {
  const { feedUrl, homeUrl } = collectionFeedUrls(input.slug);
  return {
    id: collectionSourceId(input.slug),
    name: collectionSourceColumnName(input.name, input.curatorHandle),
    feedUrl,
    homeUrl,
    topic: "all",
    topics: [],
    tags: [COLLECTION_SOURCE_TAG],
    description: "Published collection on Coeus",
    language: "Unknown",
    region: "Global",
    sourceType: "publisher",
    cadence: "daily",
    depth: "mixed",
    defaultRank: 50,
  };
}

export type FollowedCollectionRow = {
  id: string;
  slug: string;
  name: string;
  curatorHandle?: string;
};

function upsertCustomSource(prefs: UserPrefs, def: SourceDef): UserPrefs {
  const without = prefs.customSources.filter((source) => source.id !== def.id);
  const customSources = [...without, def];
  const inOrder = prefs.sourceOrder.includes(def.id);
  const sourceOrder = inOrder ? prefs.sourceOrder : [...prefs.sourceOrder, def.id];
  const hiddenSources = prefs.hiddenSources.filter((id) => id !== def.id);
  return { ...prefs, customSources, sourceOrder, hiddenSources };
}

function removeCustomSource(prefs: UserPrefs, sourceId: string): UserPrefs {
  return {
    ...prefs,
    customSources: prefs.customSources.filter((source) => source.id !== sourceId),
    sourceOrder: prefs.sourceOrder.filter((id) => id !== sourceId),
    hiddenSources: prefs.hiddenSources.filter((id) => id !== sourceId),
  };
}

/** Idempotent: adds the collection source and ensures it is enabled in sourceOrder. */
export function addFollowedCollectionToPrefs(
  prefs: UserPrefs,
  input: { slug: string; name: string; curatorHandle?: string }
): UserPrefs {
  return upsertCustomSource(prefs, buildCollectionSourceDef(input));
}

/** Removes the collection Reader source for this slug. */
export function removeFollowedCollectionFromPrefs(prefs: UserPrefs, slug: string): UserPrefs {
  return removeCustomSource(prefs, collectionSourceId(slug));
}

export function hasCollectionSourceInPrefs(prefs: UserPrefs, slug: string): boolean {
  const id = collectionSourceId(slug);
  return prefs.customSources.some((source) => source.id === id);
}

/**
 * Reconcile followed-collection Reader sources with the signed-in follow list.
 * Adds missing sources, refreshes names, and drops `c:` sources that are no
 * longer followed. Never touches other custom sources.
 */
export function mergeFollowedCollections(
  prefs: UserPrefs,
  publications: readonly FollowedCollectionRow[]
): UserPrefs {
  const followedSlugs = new Set(publications.map((row) => row.slug));
  const bySlug = new Map(publications.map((row) => [row.slug, row]));

  const nonCollection = prefs.customSources.filter((source) => !isCollectionSourceId(source.id));
  const keptCollection = prefs.customSources.flatMap((source) => {
    const slug = parseCollectionSourceId(source.id);
    if (!slug || !followedSlugs.has(slug)) return [];
    const row = bySlug.get(slug);
    return [buildCollectionSourceDef({ slug, name: row?.name ?? source.name, curatorHandle: row?.curatorHandle })];
  });

  const existingSlugs = new Set(keptCollection.map((source) => parseCollectionSourceId(source.id)!));
  const added = publications
    .filter((row) => !existingSlugs.has(row.slug))
    .map((row) => buildCollectionSourceDef(row));

  const customSources = [...nonCollection, ...keptCollection, ...added];
  const collectionIds = new Set(customSources.filter((s) => isCollectionSourceId(s.id)).map((s) => s.id));
  const sourceOrder = [
    ...prefs.sourceOrder.filter((id) => !id.startsWith(COLLECTION_SOURCE_PREFIX) || collectionIds.has(id)),
    ...[...collectionIds].filter((id) => !prefs.sourceOrder.includes(id)),
  ];

  return { ...prefs, customSources, sourceOrder };
}