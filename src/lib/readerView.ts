import sanitizeHtml from "sanitize-html";

/**
 * A bounded, in-Coeus reading layer for a page that cannot be framed. It is a
 * navigation aid — a source-attributed excerpt with a prominent link to the
 * publisher — not a replacement reading surface (PRD 6.1.2).
 */
export interface ReaderView {
  title: string;
  byline: string;
  excerpt: string;
  /** Sanitised, https-only HTML. Already truncated to the excerpt budget. */
  contentHtml: string;
  wordCount: number;
  leadImage: string | null;
  /** True when the article ran past the excerpt budget and was cut. */
  truncated: boolean;
}

/** Roughly the length of a long news lead — enough to orient, not to replace the source. */
export const EXCERPT_WORD_BUDGET = 450;

const ALLOWED_TAGS = [
  "article", "section", "div", "p", "br", "hr",
  "h2", "h3", "h4", "h5", "h6",
  "blockquote", "q", "cite", "figure", "figcaption",
  "ul", "ol", "li", "dl", "dt", "dd",
  "strong", "b", "em", "i", "u", "s", "sup", "sub", "mark", "abbr", "time",
  "code", "pre",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "span",
];

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Resolves a reference against the article URL and keeps it only if it is https. */
export function resolveHttps(reference: string | undefined, baseUrl: string): string | null {
  if (!reference) return null;
  try {
    const resolved = new URL(reference, baseUrl);
    return resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Aggressively cleans extractor output: an allowlist of structural/text tags,
 * https-only `a`/`img`, relative URLs resolved against the article, every event
 * handler / script / style / iframe / form removed, and 1×1 tracking pixels
 * dropped. `sanitize-html` also strips the *contents* of script/style.
 */
export function sanitizeReaderHtml(html: string, baseUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      "*": ["lang", "dir"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { a: ["https"], img: ["https"] },
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tag, attribs) => {
        const href = resolveHttps(attribs.href, baseUrl);
        const clean: Record<string, string> = href
          ? { href, rel: "noreferrer nofollow", target: "_blank" }
          : {};
        return { tagName: href ? "a" : "span", attribs: clean };
      },
      img: (_tag, attribs) => {
        const src = resolveHttps(attribs.src, baseUrl);
        const kept: Record<string, string> = src ? { src } : {};
        if (src) {
          for (const name of ["alt", "title", "width", "height"] as const) {
            if (attribs[name]) kept[name] = attribs[name];
          }
        }
        return { tagName: "img", attribs: kept };
      },
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        if (!frame.attribs.src) return true;
        const w = Number(frame.attribs.width);
        const h = Number(frame.attribs.height);
        if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) return true;
      }
      if (frame.tag === "a" && !frame.attribs.href && !frame.text.trim()) return true;
      return false;
    },
  });
}
