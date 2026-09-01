/**
 * Extract + pre-vet article summaries from RSS items.
 * Prefer a real lede; return "" when the feed only offers metadata/noise.
 */

const SUMMARY_MAX = 180;
const SUMMARY_MIN = 48;

/** Labels / patterns that mean "this is not a human lede". */
const JUNK_LINE =
  /^(article\s*url|comments?\s*url|points?|#\s*comments?|score|submitted\s+by|via:|source:|read\s+more|continue\s+reading|permalink|tags?:|categories?:|posted\s+by|comments?\s*:)/i;

const JUNK_ANYWHERE =
  /\b(article\s*url\s*:|comments?\s*url\s*:|points?\s*:\s*\d|#\s*comments?\s*:|item\?id=\d|news\.ycombinator\.com\/item)/i;

const URL_RE = /https?:\/\/[^\s]+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.\w+\b/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  ndash: "–",
  nbsp: " ",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

/** Decode the numeric and common named entities publishers leave in RSS text. */
export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi,
    (entity, token: string) => {
      if (token[0] !== "#") return NAMED_ENTITIES[token.toLowerCase()] ?? entity;
      const hex = token[1]?.toLowerCase() === "x";
      const point = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(point) || point <= 0 || point > 0x10ffff) return "";
      try {
        return String.fromCodePoint(point);
      } catch {
        return "";
      }
    }
  );
}

export function stripHtmlFast(html: string): string {
  if (!html) return "";
  if (!html.includes("<") && !html.includes("&")) {
    return html.replace(/\s+/g, " ").trim();
  }
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim());
}

/** Pull first substantial paragraph from HTML when snippet is missing/junk. */
function firstParagraphFromHtml(html: string): string {
  if (!html || !html.includes("<")) return "";
  const pMatch = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (pMatch?.[1]) {
    const t = stripHtmlFast(pMatch[1]);
    if (t.length >= SUMMARY_MIN) return t;
  }
  // Fallback: strip all and take start
  return stripHtmlFast(html);
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(text: string): string {
  if (text.length <= SUMMARY_MAX) return text;
  const slice = text.slice(0, SUMMARY_MAX - 1);
  const sp = slice.lastIndexOf(" ");
  const cut = sp > 80 ? slice.slice(0, sp) : slice;
  return `${cut}…`;
}

function similarityToTitle(summary: string, title: string): number {
  const a = title.toLowerCase().replace(/[^\w\s]/g, " ");
  const b = summary.toLowerCase().replace(/[^\w\s]/g, " ");
  if (!a || !b) return 0;
  if (b === a || b.startsWith(a) || a.startsWith(b)) return 1;
  const ta = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const tb = b.split(/\s+/).filter((w) => w.length > 2);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit++;
  return hit / Math.max(ta.size, tb.length);
}

/**
 * Returns true when text looks like a usable article lede.
 * Corrupt HN descriptions, link dumps, photo credits-only, etc. fail.
 */
export function isUsableSummary(text: string, title = ""): boolean {
  const s = normalizeSpace(text);
  if (!s) return false;
  if (s.length < SUMMARY_MIN) return false;

  // Metadata / HN hnrss.org style
  if (JUNK_ANYWHERE.test(s)) return false;

  const lines = s.split(/(?<=\.)\s+|\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && lines.every((l) => JUNK_LINE.test(l))) return false;
  if (JUNK_LINE.test(s)) return false;

  // Mostly URLs
  const withoutUrls = s.replace(URL_RE, "").replace(EMAIL_RE, "").trim();
  if (withoutUrls.length < SUMMARY_MIN * 0.6) return false;

  const urlChars = (s.match(URL_RE) || []).join("").length;
  if (urlChars / s.length > 0.35) return false;

  // Near-duplicate of title (no extra info)
  if (title && similarityToTitle(s, title) > 0.85 && s.length < title.length + 40) {
    return false;
  }

  // Photo/credit-only openers without prose
  if (/^(photo|image|credit|illustration)\s*:/i.test(s) && s.length < 100) {
    return false;
  }

  // Too few letters (garbage / symbols)
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  if (letters / s.length < 0.55) return false;

  // Word count floor for real prose
  const words = withoutUrls.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;

  return true;
}

/** Drop hero-image captions like "… | Photo: Credit Name Real lede…" */
function stripLeadMediaCredit(s: string): string {
  const pipePhoto = s.search(/\|\s*Photo:/i);
  if (pipePhoto >= 0 && pipePhoto < 140) {
    let rest = s.slice(pipePhoto).replace(/^\|\s*Photo:\s*/i, "");
    // Strip credit until a likely new sentence (Capitalized word after credit junk)
    rest = rest.replace(
      /^(?:[A-Za-z0-9/.,'’\s-]{3,90}?\b(?:Images|Getty|AP|Reuters|AFP)\s+)+/i,
      ""
    );
    rest = rest.replace(
      /^[A-Z][A-Za-z0-9/.,'’\s-]{0,70}?(?=[A-Z][a-z]{2,}\s+(?:was|is|are|says|said|has|have|will|can|the|a|an)\b)/,
      ""
    );
    rest = rest.trim();
    if (rest.length >= SUMMARY_MIN) return rest;
  }
  const photoLead = s.match(
    /^(?:Photo|Image|Credit|Illustration)\s*:\s*.+?\.\s+(.{48,})$/i
  );
  if (photoLead) return photoLead[1].trim();
  return s;
}

/** Clean candidate text before vetting. */
function cleanCandidate(raw: string): string {
  let s = stripHtmlFast(raw);
  // Drop trailing "Read more" / site chrome
  s = s.replace(
    /\s*(read\s+more|continue\s+reading|view\s+comments?)\s*\.?$/i,
    ""
  );
  // Collapse HN-style multi-line metadata if mixed (defensive)
  s = s
    .replace(/\bArticle URL:\s*\S+/gi, " ")
    .replace(/\bComments URL:\s*\S+/gi, " ")
    .replace(/\bPoints:\s*\d+/gi, " ")
    .replace(/#\s*Comments:\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = stripLeadMediaCredit(s);
  return s;
}

export type SummarySource = {
  contentSnippet?: string;
  summary?: string;
  content?: string;
  /** Some feeds put description only here */
  description?: string;
};

/**
 * Pick best summary from RSS fields; empty string if none pass quality gate.
 */
export function extractSummary(item: SummarySource, title: string): string {
  const candidates: string[] = [];

  const push = (raw: string | undefined, fromHtml = false) => {
    if (!raw || typeof raw !== "string") return;
    const cleaned = fromHtml
      ? cleanCandidate(firstParagraphFromHtml(raw) || raw)
      : cleanCandidate(raw);
    if (cleaned) candidates.push(cleaned);
  };

  // Prefer short snippet/summary fields first
  push(item.contentSnippet);
  push(item.summary);
  push(item.description);
  // Then first paragraph of HTML content (often better than full dump)
  if (typeof item.content === "string") {
    if (item.content.includes("<")) {
      push(item.content, true);
    } else if (item.content.length < 2500) {
      push(item.content);
    }
  }

  // Dedupe
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = c.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isUsableSummary(c, title)) {
      return truncate(c);
    }
  }

  return "";
}

/** Re-apply quality gate to already-cached summaries (schema upgrades). */
export function vetCachedSummary(summary: string, title: string): string {
  if (!summary) return "";
  const cleaned = cleanCandidate(summary);
  if (!isUsableSummary(cleaned, title)) return "";
  return truncate(cleaned);
}
