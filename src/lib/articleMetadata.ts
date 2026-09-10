import { decodeHtmlEntities } from "./summary.ts";
import { inferArticleIndex, type ArticleIndex } from "./articleIndex.ts";

/**
 * The publisher-supplied card shown when a page cannot be framed. Every field is
 * derived from the article HTML that the preview path already fetched — there is
 * no browser and no second document request.
 */
export interface ArticleCard {
  title: string;
  description: string;
  siteName: string;
  domain: string;
  /** Absolute https URL, or null when the page declares no usable image. */
  imageUrl: string | null;
  /** Absolute https URL for the site icon, or null. */
  faviconUrl: string | null;
  index: ArticleIndex;
}

/** Reads one attribute from a single tag string, tolerating quote style and order. */
function attr(tag: string, name: string): string | null {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    "i",
  ).exec(tag);
  if (!match) return null;
  return decodeHtmlEntities((match[1] ?? match[2] ?? match[3] ?? "").trim());
}

/** Collects `<meta>` values keyed by lower-cased name/property/itemprop. */
function metaTags(html: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !entries.has(key)) entries.set(key, content);
  }
  return entries;
}

function metaValues(html: string, wanted: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key === wanted && content) values.push(content);
  }
  return values;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Resolves a possibly-relative reference against the article URL; keeps https only. */
function absoluteHttps(reference: string | null | undefined, baseUrl: string): string | null {
  if (!reference) return null;
  try {
    const resolved = new URL(reference, baseUrl);
    return resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function documentTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim()) : "";
}

/** Picks the best `<link rel="…icon…">` href, preferring an explicit apple-touch icon. */
function iconHref(html: string): string | null {
  let icon: string | null = null;
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (!/\b(?:icon|shortcut icon|apple-touch-icon)\b/.test(rel)) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) return href;
    icon ??= href;
  }
  return icon;
}

export function extractArticleCard(html: string, baseUrl: string): ArticleCard {
  const meta = metaTags(html);
  let domain = "";
  try {
    domain = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    domain = "";
  }

  const title = firstNonEmpty(
    meta.get("og:title"),
    meta.get("twitter:title"),
    documentTitle(html),
  );
  const description = firstNonEmpty(
    meta.get("og:description"),
    meta.get("twitter:description"),
    meta.get("description"),
  );
  const siteName = firstNonEmpty(meta.get("og:site_name"), domain);
  const imageUrl = absoluteHttps(
    firstNonEmpty(
      meta.get("og:image:secure_url"),
      meta.get("og:image"),
      meta.get("twitter:image"),
      meta.get("twitter:image:src"),
    ),
    baseUrl,
  );
  const faviconUrl =
    absoluteHttps(iconHref(html), baseUrl) ??
    absoluteHttps("/favicon.ico", baseUrl);

  const publisherTags = [
    ...metaValues(html, "article:tag"),
    ...metaValues(html, "keywords").flatMap((value) => value.split(",")),
  ];
  return { title, description, siteName, domain, imageUrl, faviconUrl, index: inferArticleIndex({ title, description, publisherTags }) };
}
