import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";

import {
  countWords,
  resolveHttps,
  sanitizeReaderHtml,
  EXCERPT_WORD_BUDGET,
  type ReaderView,
} from "./readerView.ts";

// No `import "server-only"`: linkedom + defuddle are Node libraries but the
// module is exercised by the strip-types test runner. Network callers stay
// server-side by construction (this only takes an HTML string).
//
// Engine: defuddle (the Obsidian Web Clipper extraction engine) on its own
// linkedom-backed DOM. This is the file that the parallel Readability spike
// (bareaga_web-0bs.3) swaps out; everything downstream — sanitisation,
// truncation, the route, the modal — is shared.
export const READER_ENGINE = "defuddle" as const;

/** Must match the route at src/app/api/article-preview/image. */
const IMAGE_PROXY_PATH = "/api/article-preview/image";

/** Parses an HTML fragment into a detached <body> we can walk and edit. */
function fragmentBody(contentHtml: string) {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  document.body.innerHTML = contentHtml;
  return document.body;
}

const WRAPPER_TAGS = new Set(["DIV", "ARTICLE", "SECTION", "MAIN"]);

/** Drops whole trailing children of `el` once the running word count hits budget. */
function trimChildren(el: Element, startWords: number): { words: number; truncated: boolean } {
  let words = startWords;
  let truncated = false;
  for (const block of [...el.children]) {
    if (words >= EXCERPT_WORD_BUDGET) {
      block.remove();
      truncated = true;
      continue;
    }
    words += countWords(block.textContent ?? "");
  }
  return { words, truncated };
}

/**
 * Trims the sanitised HTML to the first whole blocks within the word budget.
 * Descends into the structural wrapper the extractor adds, then — for pages
 * whose body is one or two huge nodes (classic single-`<td>` / `<font>` essays)
 * — keeps descending into the largest remaining child so the excerpt stays a
 * navigation aid rather than the whole article (PRD 6.1.2).
 */
function truncateToBudget(contentHtml: string): { html: string; wordCount: number; truncated: boolean } {
  const root = fragmentBody(contentHtml);
  let container: Element = root;
  while (container.children.length === 1 && WRAPPER_TAGS.has(container.children[0].tagName)) {
    container = container.children[0];
  }

  let { words, truncated } = trimChildren(container, 0);
  for (let depth = 0; depth < 4 && words > EXCERPT_WORD_BUDGET * 1.6 && container.children.length > 0; depth += 1) {
    const largest = [...container.children].reduce((a, b) =>
      (b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a);
    if (largest.children.length === 0) break;
    for (const sibling of [...container.children]) if (sibling !== largest) sibling.remove();
    container = largest;
    ({ words, truncated } = trimChildren(container, 0));
    truncated = true;
  }

  return { html: container.innerHTML, wordCount: words, truncated };
}

/**
 * Rewrites every inline `<img src>` to the same-origin image proxy and returns
 * the first one as the lead image. Without this the app CSP (`img-src 'self'`)
 * would blank every publisher image in the reader content.
 */
function proxifyImages(contentHtml: string, baseUrl: string): { html: string; leadImage: string | null } {
  const body = fragmentBody(contentHtml);
  let leadImage: string | null = null;
  for (const img of body.querySelectorAll("img")) {
    const absolute = resolveHttps(img.getAttribute("src") ?? undefined, baseUrl);
    if (!absolute) {
      img.remove();
      continue;
    }
    const proxied = `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(absolute)}`;
    img.setAttribute("src", proxied);
    img.setAttribute("loading", "lazy");
    leadImage ??= proxied;
  }
  return { html: body.innerHTML, leadImage };
}

/**
 * Extracts a bounded reader view from article HTML. Returns null when the page
 * has no article-like content (a section index, a bare paywall shell, a video
 * page) — the caller then falls back to the metadata card.
 */
export async function extractReaderView(html: string, baseUrl: string): Promise<ReaderView | null> {
  let parsed;
  try {
    parsed = await Defuddle(html, baseUrl, { markdown: false });
  } catch {
    return null;
  }
  if (!parsed?.content || (parsed.wordCount ?? 0) < 50) return null;

  const sanitized = sanitizeReaderHtml(parsed.content, baseUrl);
  const trimmed = truncateToBudget(sanitized);
  if (trimmed.wordCount < 50) return null;
  const proxied = proxifyImages(trimmed.html, baseUrl);

  // Fall back to defuddle's og:image, routed through the same-origin proxy.
  const ogImage = resolveHttps(parsed.image || undefined, baseUrl);
  const leadImage =
    proxied.leadImage ?? (ogImage ? `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(ogImage)}` : null);

  return {
    title: (parsed.title ?? "").replace(/\s+/g, " ").trim(),
    byline: (parsed.author ?? "").replace(/\s+/g, " ").trim(),
    excerpt: (parsed.description ?? "").replace(/\s+/g, " ").trim(),
    contentHtml: proxied.html,
    wordCount: trimmed.wordCount,
    leadImage,
    truncated: trimmed.truncated,
  };
}
