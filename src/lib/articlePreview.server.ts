import { lookup } from "node:dns/promises";

import { BoundedCache } from "./feedCache.ts";
import { extractArticleCard, type ArticleCard } from "./articleMetadata.ts";
import { extractReaderView } from "./readerExtract.server.ts";
import type { ReaderView } from "./readerView.ts";
import { compatibilityFromHeaders, embedCompatibilityCache } from "./embedCompatibility.server.ts";
import { fetchSafeContent } from "./safeContentFetch.server.ts";
import { fetchValidatedHttps, validatedHttpsUrl, type AddressResolver } from "./safeOutboundFetch.server.ts";
import { isPreviewOptedOut, pageAppearsAccessRestricted, pageDisallowsPreview, prepareStaticPreviewHtml, PREVIEW_AGENT, robotsAllowsUrl } from "./articlePreviewPolicy.ts";

// This module deliberately omits `import "server-only"`: its policy functions
// are unit-tested by Node's strip-types runner. Keep browser/network callers server-only.

const ROBOTS_MAX_BYTES = 512 * 1024;
const ROBOTS_CACHE_MS = 60 * 60 * 1_000;
const SCREENSHOT_CACHE_MS = 60 * 60 * 1_000;
const MAX_PREVIEW_ASSETS = 24;
const MAX_PREVIEW_ASSET_BYTES = 1 * 1024 * 1024;
const MAX_PREVIEW_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_IMAGE_BYTES = 2 * 1024 * 1024;
const CARD_CACHE_MS = 60 * 60 * 1_000;
const READER_CACHE_MS = 60 * 60 * 1_000;
const screenshotCache = new BoundedCache<string, { createdAt: number; png: Uint8Array }>(100);
const cardCache = new BoundedCache<string, { createdAt: number; card: ArticleCard }>(200);
const readerCache = new BoundedCache<string, { createdAt: number; view: ReaderView }>(200);
const robotsCache = new BoundedCache<string, { checkedAt: number; allowed: boolean }>(300);

export type PreviewDecision =
  | { allowed: true }
  | { allowed: false; reason: "opted-out" | "robots" | "page-directive" | "unavailable" };

function configuredOptOutDomains(): string[] {
  return (process.env.COEUS_PREVIEW_OPTOUT_DOMAINS ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

async function robotsAllows(url: URL, resolve: AddressResolver = lookup): Promise<boolean> {
  const cacheKey = url.origin;
  const cached = robotsCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < ROBOTS_CACHE_MS) return cached.allowed;
  try {
    let { url: robotsUrl, address, family } = await validatedHttpsUrl(new URL("/robots.txt", url).toString(), resolve);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetchValidatedHttps(robotsUrl, address, family, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
        headers: { "User-Agent": `${PREVIEW_AGENT}/1.0 (+https://coeuscoeus.com/source-preview-opt-out)`, Accept: "text/plain,*/*;q=0.1" },
      }, ROBOTS_MAX_BYTES);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 5) break;
        ({ url: robotsUrl, address, family } = await validatedHttpsUrl(new URL(location, robotsUrl).toString(), resolve));
        continue;
      }
      // A missing robots file permits ordinary crawling. Other failures fail closed.
      const allowed = response.status === 404 || (response.ok && robotsAllowsUrl(await response.text(), url));
      robotsCache.set(cacheKey, { checkedAt: Date.now(), allowed });
      return allowed;
    }
  } catch {
    // Avoid producing a preview when we cannot establish publisher policy.
  }
  robotsCache.set(cacheKey, { checkedAt: Date.now(), allowed: false });
  return false;
}

async function fetchPreviewAsset(initialUrl: string): Promise<{ body: Uint8Array; contentType: string }> {
  let { url, address, family } = await validatedHttpsUrl(initialUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchValidatedHttps(url, address, family, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": `${PREVIEW_AGENT}/1.0 (+https://coeuscoeus.com/source-preview-opt-out)`, Accept: "text/css,image/avif,image/webp,image/*,font/*;q=0.8,*/*;q=0.1" },
    }, MAX_PREVIEW_ASSET_BYTES);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Too many preview asset redirects");
      ({ url, address, family } = await validatedHttpsUrl(new URL(location, url).toString()));
      continue;
    }
    if (!response.ok) throw new Error("Preview asset request failed");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream";
    return { body: new Uint8Array(await response.arrayBuffer()), contentType };
  }
  throw new Error("Too many preview asset redirects");
}

function assetMatchesResourceType(contentType: string, resourceType: string): boolean {
  if (resourceType === "stylesheet") return contentType === "text/css";
  if (resourceType === "image") return contentType.startsWith("image/");
  if (resourceType === "font") return contentType.startsWith("font/") || contentType.startsWith("application/font-") || contentType === "application/octet-stream";
  return false;
}

async function renderOfflineScreenshot(html: string, baseUrl: string): Promise<Uint8Array> {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1200, height: 630 } });
      const page = await context.newPage();
      let assetCount = 0;
      let assetBytes = 0;
      await page.route("**/*", async (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        if (!new Set(["stylesheet", "image", "font"]).has(resourceType) || assetCount >= MAX_PREVIEW_ASSETS) {
          await route.abort();
          return;
        }
        try {
          const asset = await fetchPreviewAsset(request.url());
          if (!assetMatchesResourceType(asset.contentType, resourceType) || assetBytes + asset.body.byteLength > MAX_PREVIEW_TOTAL_BYTES) {
            await route.abort();
            return;
          }
          assetCount += 1;
          assetBytes += asset.body.byteLength;
          await route.fulfill({ status: 200, contentType: asset.contentType, body: Buffer.from(asset.body) });
        } catch {
          await route.abort();
        }
      });
      await page.setContent(prepareStaticPreviewHtml(html, baseUrl), { waitUntil: "domcontentloaded", timeout: 8_000 });
      await page.waitForTimeout(600);
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 }, timeout: 8_000 });
      await context.close();
      return png;
    } finally {
      await browser.close();
    }
  } catch {
    throw new Error("Static previews are unavailable");
  }
}

export async function createArticlePreview(urlValue: string): Promise<{ decision: PreviewDecision; png?: Uint8Array }> {
  let url: URL;
  try { url = new URL(urlValue); } catch { return { decision: { allowed: false, reason: "unavailable" } }; }
  if (url.protocol !== "https:" || url.username || url.password || isPreviewOptedOut(url.hostname, configuredOptOutDomains())) {
    return { decision: { allowed: false, reason: "opted-out" } };
  }
  if (!await robotsAllows(url)) return { decision: { allowed: false, reason: "robots" } };

  const cached = screenshotCache.get(url.toString());
  if (cached && Date.now() - cached.createdAt < SCREENSHOT_CACHE_MS) return { decision: { allowed: true }, png: cached.png };
  try {
    const captured = await fetchSafeContent(url.toString());
    // These are the article's real response headers; reconcile the framing verdict
    // so the modal's compatibility probe for this URL is a cache hit, not a re-fetch.
    embedCompatibilityCache.remember(url.toString(), compatibilityFromHeaders(captured.responseHeaders));
    const html = new TextDecoder().decode(captured.body);
    if (pageDisallowsPreview(html, captured.responseHeaders) || pageAppearsAccessRestricted(html, captured.responseHeaders)) {
      return { decision: { allowed: false, reason: "page-directive" } };
    }
    const png = await renderOfflineScreenshot(html, captured.fetchedUrl);
    screenshotCache.set(url.toString(), { createdAt: Date.now(), png });
    return { decision: { allowed: true }, png };
  } catch {
    return { decision: { allowed: false, reason: "unavailable" } };
  }
}

/**
 * The blocked-embed fallback: a publisher metadata card built from the same HTML
 * the screenshot path fetched — no browser, works in production. Enforces the
 * identical policy gates (opt-out, robots, page directives, paywall heuristic).
 */
export async function createArticleCard(
  urlValue: string,
): Promise<{ decision: PreviewDecision; card?: ArticleCard }> {
  let url: URL;
  try { url = new URL(urlValue); } catch { return { decision: { allowed: false, reason: "unavailable" } }; }
  if (url.protocol !== "https:" || url.username || url.password || isPreviewOptedOut(url.hostname, configuredOptOutDomains())) {
    return { decision: { allowed: false, reason: "opted-out" } };
  }
  if (!await robotsAllows(url)) return { decision: { allowed: false, reason: "robots" } };

  const cached = cardCache.get(url.toString());
  if (cached && Date.now() - cached.createdAt < CARD_CACHE_MS) return { decision: { allowed: true }, card: cached.card };
  try {
    const captured = await fetchSafeContent(url.toString());
    embedCompatibilityCache.remember(url.toString(), compatibilityFromHeaders(captured.responseHeaders));
    const html = new TextDecoder().decode(captured.body);
    if (pageDisallowsPreview(html, captured.responseHeaders) || pageAppearsAccessRestricted(html, captured.responseHeaders)) {
      return { decision: { allowed: false, reason: "page-directive" } };
    }
    const card = extractArticleCard(html, captured.fetchedUrl);
    cardCache.set(url.toString(), { createdAt: Date.now(), card });
    return { decision: { allowed: true }, card };
  } catch {
    return { decision: { allowed: false, reason: "unavailable" } };
  }
}

export type ReaderViewResult = { decision: PreviewDecision; reader?: ReaderView };

/**
 * SPIKE (bareaga_web-0bs.3): an in-Coeus reader view for a blocked / unknown
 * embed. Same policy gates and HTML source as the metadata card; the extracted
 * content is sanitised and truncated to an excerpt in readerExtract.server.ts.
 * Returns `page-directive` when the page opts out and `unavailable` when there is
 * no article-like content to show (caller then uses the metadata card).
 */
export async function createReaderView(urlValue: string): Promise<ReaderViewResult> {
  let url: URL;
  try { url = new URL(urlValue); } catch { return { decision: { allowed: false, reason: "unavailable" } }; }
  if (url.protocol !== "https:" || url.username || url.password || isPreviewOptedOut(url.hostname, configuredOptOutDomains())) {
    return { decision: { allowed: false, reason: "opted-out" } };
  }
  if (!await robotsAllows(url)) return { decision: { allowed: false, reason: "robots" } };

  const cached = readerCache.get(url.toString());
  if (cached && Date.now() - cached.createdAt < READER_CACHE_MS) return { decision: { allowed: true }, reader: cached.view };
  try {
    const captured = await fetchSafeContent(url.toString());
    embedCompatibilityCache.remember(url.toString(), compatibilityFromHeaders(captured.responseHeaders));
    const html = new TextDecoder().decode(captured.body);
    if (pageDisallowsPreview(html, captured.responseHeaders) || pageAppearsAccessRestricted(html, captured.responseHeaders)) {
      return { decision: { allowed: false, reason: "page-directive" } };
    }
    const view = await extractReaderView(html, captured.fetchedUrl);
    if (!view) return { decision: { allowed: false, reason: "unavailable" } };
    // Defuddle does not consistently retain article:tag metadata, so combine
    // its extracted text with the publisher labels from the original document.
    view.index = extractArticleCard(html, captured.fetchedUrl).index;
    readerCache.set(url.toString(), { createdAt: Date.now(), view });
    return { decision: { allowed: true }, reader: view };
  } catch {
    return { decision: { allowed: false, reason: "unavailable" } };
  }
}

/**
 * Streams a single publisher image through our origin so the card's <img> stays
 * same-origin (img-src 'self') and every hop is DNS-pinned and size-capped. SVG
 * is refused because it executes when rendered inline.
 */
export async function fetchPreviewImage(
  initialUrl: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  let { url, address, family } = await validatedHttpsUrl(initialUrl);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchValidatedHttps(url, address, family, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: {
        "User-Agent": `${PREVIEW_AGENT}/1.0 (+https://coeuscoeus.com/source-preview-opt-out)`,
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    }, MAX_PREVIEW_IMAGE_BYTES);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Too many preview image redirects");
      ({ url, address, family } = await validatedHttpsUrl(new URL(location, url).toString()));
      continue;
    }
    if (!response.ok) throw new Error("Preview image request failed");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/") || contentType.includes("svg")) {
      throw new Error("Unsupported preview image type");
    }
    return { body: new Uint8Array(await response.arrayBuffer()), contentType };
  }
  throw new Error("Too many preview image redirects");
}
