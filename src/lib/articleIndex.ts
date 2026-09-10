/**
 * Small, local-only indexing hints for a saved or previewed article. They are
 * deliberately suggestions: publisher labels are retained separately and the
 * derived terms are deterministic, so a reader can understand where they came
 * from and can always change them later in the Archive.
 */
export interface ArticleIndex {
  publisherTags: string[];
  topics: string[];
  keywords: string[];
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "among", "another", "article", "because", "being", "between", "could", "every", "first", "from", "have", "into", "just", "more", "most", "much", "must", "only", "other", "over", "same", "some", "than", "that", "their", "there", "these", "they", "this", "those", "through", "under", "very", "what", "when", "where", "which", "while", "with", "would", "your", "story", "thing",
]);

/** Terms that describe publishing/workflow state, not a subject worth finding later. */
const LOW_SIGNAL_TERMS = new Set([
  "announce", "announced", "announcing", "continuing", "continued", "continues",
  "latest", "launch", "launched", "launches", "new", "release", "released", "releases",
  "stack", "stacks", "today", "update", "updated", "updates",
]);

const TOPIC_RULES: Array<[string, RegExp]> = [
  ["AI", /\b(?:artificial intelligence|machine learning|large language model|generative ai|\bai\b|llm)s?\b/i],
  ["climate", /\b(?:climate change|climate crisis|global warming|emissions?|decarboni[sz]|renewable energy)\b/i],
  ["technology", /\b(?:software|internet|computer|technology|digital|cyber(?:security)?|algorithm)\b/i],
  ["politics", /\b(?:election|government|congress|parliament|policy|political|democracy)\b/i],
  ["science", /\b(?:research|scientist|study|laboratory|physics|biology|medicine)\b/i],
  ["culture", /\b(?:art|artist|music|film|theatre|theater|culture|literature)\b/i],
  ["business", /\b(?:company|companies|market|markets|economy|economic|startup|finance)\b/i],
];

function cleanLabel(value: string): string | null {
  const clean = value.replace(/\s+/g, " ").replace(/^#+/, "").trim().slice(0, 48);
  return clean ? clean.toLocaleLowerCase() : null;
}

function unique(values: Iterable<string>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = cleanLabel(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length === limit) break;
  }
  return result;
}

function words(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{3,}/gu) ?? [];
}

/**
 * Keeps title-case names ("OpenAI", "New York") ahead of generic tokens.
 * These are still local suggestions, not an assertion that a named entity was
 * correctly identified.
 */
function titleEntities(title: string): string[] {
  return title.match(/\b(?:[A-Z][\p{L}\p{N}'’-]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][\p{L}\p{N}'’-]{2,}|[A-Z]{2,})){0,2}\b/gu) ?? [];
}

function qualityKeyword(term: string): boolean {
  return !STOP_WORDS.has(term) && !LOW_SIGNAL_TERMS.has(term) && !/^\d/.test(term);
}

export function inferArticleIndex({
  title,
  description = "",
  publisherTags = [],
  sourceTopic,
}: {
  title: string;
  description?: string;
  publisherTags?: string[];
  sourceTopic?: string;
}): ArticleIndex {
  const text = `${title} ${description}`.toLocaleLowerCase();
  const topics = unique([
    ...(sourceTopic && sourceTopic !== "all" ? [sourceTopic] : []),
    ...TOPIC_RULES.filter(([, expression]) => expression.test(text)).map(([topic]) => topic),
  ], 3);
  const titleWords = new Set(words(title));
  const counts = new Map<string, number>();
  for (const word of words(text)) {
    if (!qualityKeyword(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + (titleWords.has(word) ? 2 : 1));
  }
  // A one-off ordinary word is often just headline grammar. Keep it only when
  // it has evidence in both title and description (score >= 3), or when it is
  // a title-case name. This trades a little recall for much cleaner Archive
  // search tags.
  const scoredKeywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .filter(([, score]) => score >= 3)
    .map(([word]) => word);
  const keywords = unique([
    ...titleEntities(title).filter((entity) => qualityKeyword(entity.toLocaleLowerCase())),
    ...scoredKeywords,
  ], 5).filter((word) => !topics.includes(word));

  return { publisherTags: unique(publisherTags, 6), topics, keywords };
}
