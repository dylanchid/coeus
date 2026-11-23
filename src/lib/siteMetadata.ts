/** Document title used when a page does not set its own. The layout template is not applied to it. */
export const SITE_TITLE = "Coeus: a personal front page for the open web";
export const SITE_NAME = "Coeus";
export const SITE_DESCRIPTION =
  "Choose your sources, read one finite page, and publish collections anyone can follow, in Coeus or any RSS reader.";

/** Share descriptions stay within the length most unfurlers keep. */
export const DESCRIPTION_MAX = 160;

export const COLLECTION_NOT_FOUND_TITLE = "Collection not found";
export const PROFILE_NOT_FOUND_TITLE = "Profile not found";
export const THREAD_NOT_FOUND_TITLE = "Thread not found";

/**
 * Crawl blocks. Directory prefixes keep a trailing slash; individual pages do not,
 * so `/archive` does not also hide a future `/archive-something` path by accident
 * and `/api/` still covers the whole API tree.
 */
export const ROBOTS_DISALLOW = [
  "/api/",
  "/archive",
  "/auth/",
  "/signin",
  "/welcome",
  "/plus",
  "/notifications",
  "/messages",
  "/u/",
] as const;

/** Indexable static routes. Published collections and profiles are appended at request time. */
export const SITEMAP_STATIC_PATHS = ["/", "/about", "/c", "/discover", "/sources"] as const;

const ELLIPSIS = "…";

/** File-convention cards. Repeated on each page because a child `openGraph` replaces the parent, including images the root file had already attached. */
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Coeus, a personal front page for the open web.",
  type: "image/png",
};
const TWITTER_IMAGE = {
  url: "/twitter-image",
  width: 1200,
  height: 630,
  alt: "Coeus, a personal front page for the open web.",
};

export function truncateShareDescription(value: string, limit = DESCRIPTION_MAX): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const head = trimmed.slice(0, limit - ELLIPSIS.length).trimEnd();
  return `${head}${ELLIPSIS}`;
}

export function collectionShareTitle(name: string, handle: string | null | undefined): string {
  const normalized = handle?.trim();
  return normalized ? `${name} by @${normalized}` : name;
}

/** Curator note wins over the collection description. Both may be blank. */
export function collectionShareText(curatorNote: string, description: string): string {
  return curatorNote.trim() || description.trim();
}

export function profileShareTitle(displayName: string, handle: string): string {
  return `${displayName} (@${handle})`;
}

export function profileShareDescription(bio: string | null | undefined, handle: string): string {
  return bio?.trim() || `Collections by @${handle}`;
}

export interface SitemapPublicationRef {
  slug: string;
  updatedAt: string;
  ownerHandle: string;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency: "daily" | "weekly";
  priority: number;
}

export function buildSitemap(origin: string, publications: readonly SitemapPublicationRef[]): SitemapEntry[] {
  const entries: SitemapEntry[] = SITEMAP_STATIC_PATHS.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));

  for (const publication of publications) {
    if (!publication.slug) continue;
    entries.push({
      url: `${origin}/c/${publication.slug}`,
      lastModified: publication.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  const seenHandles = new Set<string>();
  for (const publication of publications) {
    const handle = publication.ownerHandle.trim();
    if (!handle || seenHandles.has(handle)) continue;
    seenHandles.add(handle);
    entries.push({
      url: `${origin}/@${handle}`,
      lastModified: publication.updatedAt,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  return entries;
}

export interface PageMetadataInput {
  /** Bare title. The root layout template appends ` | Coeus`. Omit it on the home page. */
  title?: string;
  path: string;
  description: string;
  /** When true, emit `noindex`. Follow stays allowed unless `nofollow` is also set. */
  noindex?: boolean;
  nofollow?: boolean;
  ogType?: "website" | "article";
  twitterCard?: "summary" | "summary_large_image";
  /** Extra `<link rel="alternate">` types, such as a collection RSS feed. */
  types?: Record<string, string>;
}

/**
 * Full metadata for one route. Next replaces a parent `openGraph` or `twitter`
 * object instead of deep-merging it, so each page repeats site name, locale,
 * and card type, including the share-card image. A nested route that sets
 * `openGraph` drops images inherited from the root file convention.
 *
 * The return is structurally a Next `Metadata` object. This module does not
 * import `next`: domain core stays free of the framework runtime.
 */
export function pageMetadata(input: PageMetadataInput) {
  const description = truncateShareDescription(input.description);
  const shareTitle = input.title?.trim() || SITE_TITLE;
  const ogType = input.ogType ?? "website";
  const card = input.twitterCard ?? "summary_large_image";
  const share = { title: shareTitle, description };
  const openGraph =
    ogType === "article"
      ? { ...share, url: input.path, type: "article" as const, siteName: SITE_NAME, locale: "en_US", images: [SHARE_IMAGE] }
      : { ...share, url: input.path, type: "website" as const, siteName: SITE_NAME, locale: "en_US", images: [SHARE_IMAGE] };
  const twitter =
    card === "summary"
      ? { ...share, card: "summary" as const, images: [TWITTER_IMAGE] }
      : { ...share, card: "summary_large_image" as const, images: [TWITTER_IMAGE] };
  const metadata = {
    description,
    alternates: {
      canonical: input.path,
      ...(input.types ? { types: input.types } : {}),
    },
    openGraph,
    twitter,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.noindex || input.nofollow
      ? { robots: { index: !input.noindex, follow: !input.nofollow } }
      : {}),
  };
  return metadata;
}
