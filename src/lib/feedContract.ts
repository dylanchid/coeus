import {
  TOPICS,
  allSources,
  catalogSourceIds,
  defaultSourceOrder,
  sanitizeCustomSources,
  type Topic,
} from "./sources.ts";
import type { SourceDef } from "./types.ts";

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

/** Body-request variant: carries the requester's custom (non-catalog) sources. */
export interface FeedBodyRequestQuery extends FeedRequestQuery {
  customSources: SourceDef[];
}

export type FeedQueryParseResult =
  | { ok: true; value: FeedRequestQuery }
  | { ok: false; error: string };

export type FeedBodyParseResult =
  | { ok: true; value: FeedBodyRequestQuery }
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

const ALLOWED_BODY_KEYS = new Set(["ids", "customSources", "limit", "hours", "topic", "refresh"]);

function clampBodyNumber(
  name: "limit" | "hours",
  value: unknown,
  bounds: { default: number; min: number; max: number }
): number | string {
  if (value === undefined) return bounds.default;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return `${name} must be an integer`;
  }
  if (value < bounds.min || value > bounds.max) {
    return `${name} must be between ${bounds.min} and ${bounds.max}`;
  }
  return value;
}

/**
 * Body variant of parseFeedQuery for requests that reference custom
 * (non-catalog) sources. This path never trusts the client's sanitization —
 * customSources is re-validated here exactly as prefs.ts validates on load.
 */
export function parseFeedBody(raw: unknown): FeedBodyParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return { ok: false, error: `Unknown field: ${key}` };
    }
  }

  const customSources = sanitizeCustomSources(body.customSources);

  if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) {
    return { ok: false, error: "ids must be an array of strings" };
  }
  const requestedIds = body.ids.map((id) => id.trim()).filter(Boolean);
  if (!requestedIds.length) {
    return { ok: false, error: "ids must contain at least one source" };
  }
  const sourceIds = [...new Set(requestedIds)];
  if (sourceIds.length > FEED_QUERY_LIMITS.maxSources) {
    return {
      ok: false,
      error: `ids may contain at most ${FEED_QUERY_LIMITS.maxSources} sources`,
    };
  }
  const knownIds = new Set(allSources(customSources).map((source) => source.id));
  const unknownIds = sourceIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length) {
    return { ok: false, error: `Unknown source ids: ${unknownIds.join(", ")}` };
  }

  const limit = clampBodyNumber("limit", body.limit, FEED_QUERY_LIMITS.limit);
  if (typeof limit === "string") return { ok: false, error: limit };
  const hours = clampBodyNumber("hours", body.hours, FEED_QUERY_LIMITS.hours);
  if (typeof hours === "string") return { ok: false, error: hours };

  const topic = typeof body.topic === "string" ? body.topic : "all";
  if (!TOPICS.includes(topic as Topic)) {
    return { ok: false, error: `Unknown topic: ${topic}` };
  }

  if (body.refresh !== undefined && typeof body.refresh !== "boolean") {
    return { ok: false, error: "refresh must be a boolean" };
  }

  return {
    ok: true,
    value: {
      sourceIds,
      customSources,
      limit,
      hours,
      topic: topic as Topic,
      forceRefresh: body.refresh === true,
    },
  };
}
