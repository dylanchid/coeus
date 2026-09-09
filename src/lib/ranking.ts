import type { EmbedCompatibility, KeywordRule, SourceFeed } from "./types";

export type RankingReason = {
  label: string;
  points: number;
};

export type RankedStory = {
  key: string;
  article: SourceFeed["articles"][number];
  sourceId: string;
  sourceName: string;
  sourceTopic: string;
  sourceHomeUrl?: string;
  embedCompatibility: EmbedCompatibility;
  sourceIndex: number;
  articleIndex: number;
  score: number;
  reasons: RankingReason[];
  matchedTerms: string[];
};

const RULE_PATTERN = /^(?:@([\w-]+)\s+)?(?:"([^"]+)"|(.+?))\s+([+-](?:\d+(?:\.\d+)?|\.\d+))$/;

/** Parse one inspectable rule per line: `AI +5` or `@hn "local-first" +8`. */
export function parseKeywordRules(
  text: string,
  knownSourceIds?: ReadonlySet<string>
): KeywordRule[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line): KeywordRule[] => {
      const match = line.match(RULE_PATTERN);
      if (!match) return [];
      const sourceId = match[1];
      const term = (match[2] ?? match[3] ?? "").trim();
      const weight = Number(match[4]);
      if (
        !term ||
        !Number.isFinite(weight) ||
        weight === 0 ||
        (sourceId && knownSourceIds && !knownSourceIds.has(sourceId))
      ) {
        return [];
      }
      return [{
        term: term.slice(0, 80),
        weight: Math.max(-10, Math.min(10, weight)),
        ...(sourceId ? { sourceId } : {}),
      }];
    })
    .slice(0, 100);
}

export function formatKeywordRules(rules: KeywordRule[]): string {
  return rules
    .map((rule) => {
      const term = /\s/.test(rule.term) ? `"${rule.term.replaceAll('"', "")}"` : rule.term;
      const weight = `${rule.weight > 0 ? "+" : ""}${rule.weight}`;
      return `${rule.sourceId ? `@${rule.sourceId} ` : ""}${term} ${weight}`;
    })
    .join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  const escaped = escapeRegExp(term.trim());
  if (!escaped) return false;
  const boundary = /^[\p{L}\p{N}_]+$/u.test(term)
    ? `\\b${escaped}\\b`
    : escaped;
  return new RegExp(boundary, "iu").test(text);
}

function engagementSignal(story: RankedStory): number {
  const engagement = story.article.engagement;
  if (!engagement) return 0;
  return Math.log1p(engagement.points ?? 0) + 1.25 * Math.log1p(engagement.comments ?? 0);
}

function recencyPoints(publishedAt: string | null, now: number): number {
  if (!publishedAt) return 0;
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return 0;
  const ageHours = Math.max(0, (now - published) / 3_600_000);
  return Math.round(20 * 2 ** (-ageHours / 24));
}

function flatten(sources: SourceFeed[]): RankedStory[] {
  return sources.flatMap((source, sourceIndex) =>
    source.error
      ? []
      : source.articles.map((article, articleIndex) => ({
          key: `${source.id}:${article.id}`,
          article,
          sourceId: source.id,
          sourceName: source.name,
          sourceTopic: source.topic,
          sourceHomeUrl: source.homeUrl,
          embedCompatibility: source.embedCompatibility ?? "unknown",
          sourceIndex,
          articleIndex,
          score: 0,
          reasons: [],
          matchedTerms: [],
        }))
  );
}

function baseScore(
  story: RankedStory,
  rules: KeywordRule[],
  sourceWeights: Record<string, number>,
  sourceEngagementMax: Map<string, number>,
  now: number
): RankedStory {
  const reasons: RankingReason[] = [];
  const matchedTerms: string[] = [];
  let keywordPoints = 0;

  for (const rule of rules) {
    if (rule.sourceId && rule.sourceId !== story.sourceId) continue;
    const titleMatch = containsTerm(story.article.title, rule.term);
    const summaryMatch = containsTerm(story.article.summary, rule.term);
    if (!titleMatch && !summaryMatch) continue;
    const points = Math.round(rule.weight * (titleMatch ? 4 : 2));
    keywordPoints += points;
    if (rule.weight > 0) matchedTerms.push(rule.term);
    reasons.push({ label: rule.term, points });
  }
  keywordPoints = clamp(keywordPoints, -45, 45);
  const keywordReasonsTotal = reasons.reduce((sum, reason) => sum + reason.points, 0);
  if (keywordReasonsTotal !== keywordPoints && reasons.length) {
    reasons.push({ label: "keyword cap", points: keywordPoints - keywordReasonsTotal });
  }

  const sourceWeight = sourceWeights[story.sourceId] ?? 1;
  const sourcePoints = Math.round((sourceWeight - 1) * 40);
  if (sourcePoints) reasons.push({ label: `${story.sourceName} preference`, points: sourcePoints });

  const recent = recencyPoints(story.article.publishedAt, now);
  if (recent) reasons.push({ label: "recent", points: recent });

  const signal = engagementSignal(story);
  const maxSignal = sourceEngagementMax.get(story.sourceId) ?? 0;
  const engagement = maxSignal > 0 ? Math.round((signal / maxSignal) * 10) : 0;
  if (engagement) reasons.push({ label: "engagement", points: engagement });

  return {
    ...story,
    score: keywordPoints + sourcePoints + recent + engagement,
    reasons,
    matchedTerms: [...new Set(matchedTerms)],
  };
}

function diversityPenalty(candidate: RankedStory, chosen: RankedStory[]): number {
  if (!chosen.length) return 0;
  const last = chosen.at(-1)!;
  let penalty = 0;
  if (last.sourceId === candidate.sourceId) penalty -= 5;
  else if (last.sourceTopic === candidate.sourceTopic) penalty -= 2;
  const recentSameSource = chosen
    .slice(-5)
    .filter((story) => story.sourceId === candidate.sourceId).length;
  penalty -= Math.min(6, recentSameSource * 2);
  return penalty;
}

/** Rank with transparent components, then greedily diversify nearby results. */
export function rankStories(
  sources: SourceFeed[],
  rules: KeywordRule[],
  sourceWeights: Record<string, number>,
  now = Date.now()
): RankedStory[] {
  const stories = flatten(sources);
  const sourceEngagementMax = new Map<string, number>();
  for (const story of stories) {
    sourceEngagementMax.set(
      story.sourceId,
      Math.max(sourceEngagementMax.get(story.sourceId) ?? 0, engagementSignal(story))
    );
  }

  const remaining = stories.map((story) =>
    baseScore(story, rules, sourceWeights, sourceEngagementMax, now)
  );
  const chosen: RankedStory[] = [];
  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestPenalty = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const penalty = diversityPenalty(candidate, chosen);
      const adjusted = candidate.score + penalty;
      if (adjusted > bestScore) {
        bestIndex = index;
        bestScore = adjusted;
        bestPenalty = penalty;
      }
    }
    const [picked] = remaining.splice(bestIndex, 1);
    if (!picked) break;
    chosen.push({
      ...picked,
      score: bestScore,
      reasons: bestPenalty
        ? [...picked.reasons, { label: "diversity", points: bestPenalty }]
        : picked.reasons,
    });
  }
  return chosen;
}
