const LINK_TAG_RE = /<link\b[^>]*>/gi;
const FEED_TYPE_RE = /^application\/(rss|atom)\+xml$/i;

function extractAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}

/**
 * Find the first RSS/Atom autodiscovery link in a page's HTML, resolved
 * against the page URL. Pure string parsing rather than a DOM dependency,
 * since we only need <link rel="alternate" type="application/(rss|atom)+xml">
 * tags, which WordPress, Ghost, and most static-site generators emit in <head>.
 */
export function findFeedLink(html: string, baseUrl: string): string | null {
  const tags = html.match(LINK_TAG_RE) ?? [];
  for (const tag of tags) {
    const rel = extractAttr(tag, "rel");
    if (!rel || !/\balternate\b/i.test(rel)) continue;
    const type = extractAttr(tag, "type");
    if (!type || !FEED_TYPE_RE.test(type.trim())) continue;
    const href = extractAttr(tag, "href");
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}
