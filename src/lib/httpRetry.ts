/**
 * Outbound HTTP hardening for destination adapters: every request gets an
 * explicit timeout, and transient failures (network errors, timeouts, 429, and
 * 502/503/504) are retried a bounded number of times with exponential backoff
 * plus jitter. A `Retry-After` header, when present and sane, wins over the
 * computed backoff.
 *
 * No adapter-specific logic lives here so it stays unit-testable against a
 * stubbed fetch with a fake clock.
 */

export interface RetryOptions {
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Retries after the first attempt (so `2` means up to 3 requests). */
  retries?: number;
  /** Base backoff; attempt n waits ~baseDelayMs * 2^(n-1) plus jitter. */
  baseDelayMs?: number;
  /** Ceiling on any single backoff wait. */
  maxDelayMs?: number;
  /** Injectable sleep, for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable jitter in [0, 1), for tests. */
  random?: () => number;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

function backoffDelay(attempt: number, opts: Required<Pick<RetryOptions, "baseDelayMs" | "maxDelayMs">>, random: () => number): number {
  const exponential = opts.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, opts.maxDelayMs);
  // Full jitter: wait a random amount in [0, capped].
  return Math.round(capped * random());
}

/**
 * Parse a `Retry-After` header value (delta-seconds or an HTTP date) into
 * milliseconds, clamped to `maxMs` and rejecting nonsense. Shared with the
 * client sync queue's backoff.
 */
export function parseRetryAfterMs(header: string | null, maxMs = 120_000): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds * 1000 <= maxMs) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    if (delta >= 0 && delta <= maxMs) return delta;
  }
  return null;
}

function retryAfterMs(response: Response): number | null {
  return parseRetryAfterMs(response.headers.get("retry-after"));
}

/**
 * A `fetch` wrapper: same signature, but each call is time-boxed and transient
 * failures are retried. The returned Response is the last one received; a
 * request that keeps throwing rethrows the final error.
 */
export async function fetchWithRetry(
  fetcher: typeof fetch,
  input: string | URL,
  init: RequestInit | undefined,
  options: RetryOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = Math.max(0, options.retries ?? DEFAULTS.retries);
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await fetcher(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (attempt <= retries && isRetryableStatus(response.status)) {
        const wait = retryAfterMs(response) ?? backoffDelay(attempt, { baseDelayMs, maxDelayMs }, random);
        await sleep(wait);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt > retries) break;
      await sleep(backoffDelay(attempt, { baseDelayMs, maxDelayMs }, random));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
