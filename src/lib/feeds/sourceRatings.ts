import { catalogSourceIds } from "./sources.ts";

/** Ten buckets: index 0 is ½ star, index 9 is 5 stars. */
export const RATING_BUCKETS = 10;

export interface SourceRatingSummary {
  /** Counts per half-star bucket, length RATING_BUCKETS. */
  histogram: number[];
  count: number;
  /** Mean in stars (0.5–5), or null when nobody has rated yet. */
  average: number | null;
}

export function summarizeRatings(rows: { halfSteps: number; ratings: number }[]): SourceRatingSummary {
  const histogram = Array.from({ length: RATING_BUCKETS }, () => 0);
  let count = 0;
  let total = 0;
  for (const { halfSteps, ratings } of rows) {
    if (!Number.isInteger(halfSteps) || halfSteps < 1 || halfSteps > RATING_BUCKETS) continue;
    if (!Number.isFinite(ratings) || ratings <= 0) continue;
    histogram[halfSteps - 1] += ratings;
    count += ratings;
    total += ratings * halfSteps;
  }
  return { histogram, count, average: count ? total / count / 2 : null };
}

export type ParsedRatingWrite =
  | { ok: true; value: { sourceId: string; halfSteps: number } }
  | { ok: false; error: string };

/** Body of PUT: `rating` is in stars (0 clears), half-star steps only. */
export function parseRatingWrite(body: unknown): ParsedRatingWrite {
  if (!body || typeof body !== "object") return { ok: false, error: "Request body must be an object" };
  const { sourceId, rating } = body as Record<string, unknown>;
  if (typeof sourceId !== "string" || !catalogSourceIds().includes(sourceId)) {
    return { ok: false, error: "Unknown source" };
  }
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 5 || !Number.isInteger(rating * 2)) {
    return { ok: false, error: "rating must be 0 or a half-star value up to 5" };
  }
  return { ok: true, value: { sourceId, halfSteps: rating * 2 } };
}
