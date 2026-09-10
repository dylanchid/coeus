import { lookup } from "node:dns/promises";
import { BoundedCache } from "./feedCache.ts";
import {
  fetchValidatedHttps,
  validatedHttpsUrl,
  type AddressResolver,
} from "./safeOutboundFetch.server.ts";
import type { EmbedCompatibility } from "./types.ts";

const MAX_REDIRECTS = 5;
const AUDIT_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const UNKNOWN_CACHE_TTL_MS = 60 * 60 * 1_000;

type EmbedResponseFetcher = (url: URL, init: RequestInit) => Promise<Response>;
type CacheEntry = { compatibility: EmbedCompatibility; checkedAt: number };

// Embed controls express the publisher's intent. Any explicit restriction that
// cannot be shown to allow arbitrary HTTPS parents is treated as a block.
export function compatibilityFromHeaders(headers: Headers): EmbedCompatibility {
  const xFrameOptions = headers.get("x-frame-options") ?? "";
  if (/\b(?:deny|sameorigin|allow-from)\b/i.test(xFrameOptions)) return "blocked";

  const csp = headers.get("content-security-policy") ?? "";
  const directive = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp)?.[1];
  if (!directive) return "allowed";
  const ancestors = directive.toLowerCase().split(/\s+/);
  return ancestors.includes("*") || ancestors.includes("https:")
    ? "allowed"
    : "blocked";
}

export async function inspectEmbedCompatibility(
  initialUrl: string,
  options: { fetcher?: EmbedResponseFetcher; resolve?: AddressResolver } = {},
): Promise<EmbedCompatibility> {
  const resolve = options.resolve ?? lookup;
  let { url, address, family } = await validatedHttpsUrl(initialUrl, resolve);
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      // GET, not HEAD: many origins omit X-Frame-Options / CSP on HEAD or vary it
      // per method. maxBytes 0 keeps this to headers only — the body is discarded.
      const init = {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
        headers: { "User-Agent": "coeus/1.0 embed compatibility audit" },
      } as const;
      const response = options.fetcher
        ? await options.fetcher(url, init)
        : await fetchValidatedHttps(url, address, family, init, 0);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) return "unknown";
        ({ url, address, family } = await validatedHttpsUrl(new URL(location, url).toString(), resolve));
        continue;
      }
      return response.ok ? compatibilityFromHeaders(response.headers) : "unknown";
    }
  } catch {
    // Network failures and defensive URL rejections must never turn into an
    // implicit permission to embed.
    return "unknown";
  }
  return "unknown";
}

/**
 * Bounded process-local cache keyed by the exact article URL, so a verdict reflects
 * that article's headers rather than a single probe for the whole feed. Confirmed
 * allowed/blocked verdicts hold for 24h; "unknown" is re-checked within the hour so
 * a transient network failure does not stick.
 */
export class EmbedCompatibilityCache {
  private readonly entries = new BoundedCache<string, CacheEntry>(500);
  private readonly inflight = new BoundedCache<string, Promise<EmbedCompatibility>>(500);

  async get(articleUrl: string): Promise<EmbedCompatibility> {
    const cached = this.entries.get(articleUrl);
    const maxAge = cached?.compatibility === "unknown" ? UNKNOWN_CACHE_TTL_MS : CACHE_TTL_MS;
    if (cached && Date.now() - cached.checkedAt < maxAge) return cached.compatibility;

    let pending = this.inflight.get(articleUrl);
    if (!pending) {
      pending = inspectEmbedCompatibility(articleUrl)
        .then((compatibility) => {
          this.entries.set(articleUrl, { compatibility, checkedAt: Date.now() });
          this.inflight.delete(articleUrl);
          return compatibility;
        })
        .catch(() => {
          this.entries.set(articleUrl, { compatibility: "unknown", checkedAt: Date.now() });
          this.inflight.delete(articleUrl);
          return "unknown" as const;
        });
      this.inflight.set(articleUrl, pending);
    }
    return pending;
  }

  /**
   * Records a verdict derived from headers a caller already fetched for another
   * purpose (e.g. the preview content fetch), sparing a redundant probe. A
   * confirmed allowed/blocked verdict never regresses to a cached "unknown".
   */
  remember(articleUrl: string, compatibility: EmbedCompatibility): void {
    if (compatibility === "unknown" && this.entries.get(articleUrl)) return;
    this.entries.set(articleUrl, { compatibility, checkedAt: Date.now() });
  }
}

export const embedCompatibilityCache = new EmbedCompatibilityCache();
