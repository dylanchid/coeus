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
      const init = {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
        headers: { "User-Agent": "coeus/1.0 embed compatibility audit" },
      } as const;
      const response = options.fetcher
        ? await options.fetcher(url, init)
        : await fetchValidatedHttps(url, address, family, init);
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

/** Bounded process-local cache; a feed response never needs to expose URLs or headers. */
export class EmbedCompatibilityCache {
  private readonly entries = new BoundedCache<string, CacheEntry>(500);
  private readonly inflight = new BoundedCache<string, Promise<EmbedCompatibility>>(500);

  async get(key: string, articleUrl: string): Promise<EmbedCompatibility> {
    const cached = this.entries.get(key);
    const maxAge = cached?.compatibility === "unknown" ? UNKNOWN_CACHE_TTL_MS : CACHE_TTL_MS;
    if (cached && Date.now() - cached.checkedAt < maxAge) return cached.compatibility;

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = inspectEmbedCompatibility(articleUrl)
        .then((compatibility) => {
          this.entries.set(key, { compatibility, checkedAt: Date.now() });
          this.inflight.delete(key);
          return compatibility;
        })
        .catch(() => {
          this.entries.set(key, { compatibility: "unknown", checkedAt: Date.now() });
          this.inflight.delete(key);
          return "unknown" as const;
        });
      this.inflight.set(key, pending);
    }
    return pending;
  }
}

export const embedCompatibilityCache = new EmbedCompatibilityCache();
