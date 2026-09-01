import type { Article, SourceFeed } from "./types";

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match titles + summaries. Supports multi-word AND (all tokens must match). */
export function articleMatches(
  article: Article,
  query: string,
  tokens?: string[]
): boolean {
  const q = tokens ? "" : normalizeQuery(query);
  const toks = tokens ?? (q ? q.split(" ").filter(Boolean) : []);
  if (!toks.length) return true;
  // Avoid template alloc when summary empty
  const hay = article.summary
    ? `${article.title} ${article.summary}`.toLowerCase()
    : article.title.toLowerCase();
  for (let i = 0; i < toks.length; i++) {
    if (!hay.includes(toks[i])) return false;
  }
  return true;
}

export function filterSources(
  sources: SourceFeed[],
  query: string
): SourceFeed[] {
  const q = normalizeQuery(query);
  if (!q) return sources;
  const tokens = q.split(" ").filter(Boolean);
  const out: SourceFeed[] = [];
  for (const s of sources) {
    const articles = s.articles.filter((a) => articleMatches(a, q, tokens));
    if (articles.length > 0 || s.error) {
      out.push(articles === s.articles ? s : { ...s, articles });
    }
  }
  return out;
}

export function countMatches(sources: SourceFeed[], query: string): number {
  const q = normalizeQuery(query);
  if (!q) {
    let n = 0;
    for (const s of sources) n += s.articles.length;
    return n;
  }
  const tokens = q.split(" ").filter(Boolean);
  let n = 0;
  for (const s of sources) {
    for (const a of s.articles) {
      if (articleMatches(a, q, tokens)) n++;
    }
  }
  return n;
}
