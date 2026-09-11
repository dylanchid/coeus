import { parseRetryAfterMs } from "../httpRetry.ts";

/**
 * How the client sync queue should treat a failed synchronization attempt.
 *
 * - `auth`      — 401/403. The session is gone; looping cannot fix it. Pause and
 *                 wait for an explicit retry (after re-authentication).
 * - `validation`— a permanent 4xx (bad contract, rejected payload). Looping
 *                 re-sends the same rejected operations forever. Pause and surface.
 * - `retryable` — 408/409/429/5xx or a network error. Retry with bounded backoff.
 * - `malformed` — the response was not the shape we require. The server contract
 *                 is broken for this client; pause and surface rather than loop.
 */
export type SyncFailureClass = "auth" | "validation" | "retryable" | "malformed";

export function isPermanent(kind: SyncFailureClass): boolean {
  return kind !== "retryable";
}

/** Classify an HTTP status from a completed (non-network-error) response. */
export function classifyStatus(status: number): SyncFailureClass {
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 409 || status === 429) return "retryable";
  if (status >= 400 && status < 500) return "validation";
  return "retryable"; // 5xx and anything unexpected
}

export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  /** Injectable jitter in [0, 1); defaults to Math.random. */
  random?: () => number;
}

export const DEFAULT_BACKOFF: BackoffConfig = { baseMs: 1_000, maxMs: 5 * 60_000 };

/**
 * Bounded exponential backoff with half jitter: attempt n waits between
 * `d/2` and `d` where `d = min(base * 2^n, max)`. A valid `Retry-After`
 * (seconds or HTTP date), when present, overrides the computed delay.
 * `attempt` is 0-indexed (0 is the first retry).
 */
export function backoffMs(attempt: number, retryAfterHeader: string | null, config: BackoffConfig = DEFAULT_BACKOFF): number {
  const fromHeader = parseRetryAfterMs(retryAfterHeader, config.maxMs);
  if (fromHeader != null) return fromHeader;
  const random = config.random ?? Math.random;
  const ceiling = Math.min(config.baseMs * 2 ** Math.max(0, attempt), config.maxMs);
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}
