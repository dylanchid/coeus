import { TOPICS, catalogSourceIds, defaultSourceOrder, type Topic } from "./sources.ts";

export const FEED_QUERY_LIMITS = {
  maxSources: 40,
  limit: { default: 10, min: 1, max: 50 },
  hours: { default: 24, min: 1, max: 168 },
} as const;

export interface FeedRequestQuery {
  sourceIds: string[];
  limit: number;
  hours: number;
  topic: Topic;
  forceRefresh: boolean;
}

export type FeedQueryParseResult =
  | { ok: true; value: FeedRequestQuery }
  | { ok: false; error: string };

const ALLOWED_PARAMETERS = new Set(["ids", "limit", "hours", "topic", "refresh"]);

function parseInteger(
  params: URLSearchParams,
  name: "limit" | "hours",
  bounds: { default: number; min: number; max: number }
): number | string {
  const values = params.getAll(name);
  if (!values.length) return bounds.default;
  if (values.length !== 1 || !/^\d+$/.test(values[0])) {
    return `${name} must be one integer`;
  }
  const value = Number(values[0]);
  if (value < bounds.min || value > bounds.max) {
    return `${name} must be between ${bounds.min} and ${bounds.max}`;
  }
  return value;
}

export function parseFeedQuery(params: URLSearchParams): FeedQueryParseResult {
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      return { ok: false, error: `Unknown query parameter: ${key}` };
    }
  }

  const limit = parseInteger(params, "limit", FEED_QUERY_LIMITS.limit);
  if (typeof limit === "string") return { ok: false, error: limit };
  const hours = parseInteger(params, "hours", FEED_QUERY_LIMITS.hours);
  if (typeof hours === "string") return { ok: false, error: hours };

  const topics = [...new Set(params.getAll("topic").filter(Boolean))];
  if (topics.length > 1) return { ok: false, error: "topic must have one value" };
  const topic = topics[0] ?? "all";
  if (!TOPICS.includes(topic as Topic)) {
    return { ok: false, error: `Unknown topic: ${topic}` };
  }

  const refreshValues = [...new Set(params.getAll("refresh").filter(Boolean))];
  if (refreshValues.length > 1) {
    return { ok: false, error: "refresh must have one value" };
  }
  const refresh = refreshValues[0];
  if (refresh && !["0", "1", "false", "true"].includes(refresh)) {
    return { ok: false, error: "refresh must be 0, 1, false, or true" };
  }

  const idsValues = params.getAll("ids");
  const requestedIds = idsValues.flatMap((value) => value.split(","))
    .map((id) => id.trim())
    .filter(Boolean);
  if (idsValues.length && !requestedIds.length) {
    return { ok: false, error: "ids must contain at least one source" };
  }
  const sourceIds = idsValues.length ? [...new Set(requestedIds)] : defaultSourceOrder();
  if (sourceIds.length > FEED_QUERY_LIMITS.maxSources) {
    return {
      ok: false,
      error: `ids may contain at most ${FEED_QUERY_LIMITS.maxSources} sources`,
    };
  }
  const knownIds = new Set(catalogSourceIds());
  const unknownIds = sourceIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length) {
    return { ok: false, error: `Unknown source ids: ${unknownIds.join(", ")}` };
  }

  return {
    ok: true,
    value: {
      sourceIds,
      limit,
      hours,
      topic: topic as Topic,
      forceRefresh: refresh === "1" || refresh === "true",
    },
  };
}
