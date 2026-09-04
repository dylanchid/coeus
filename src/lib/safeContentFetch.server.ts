import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isUnsafeIp, UnsafeFeedUrlError } from "./safeFeedFetch.server.ts";

const MAX_REDIRECTS = 5;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

async function checkedUrl(value: string, resolve = lookup): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeFeedUrlError("Content URL is not valid"); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new UnsafeFeedUrlError("Content URL must be a credential-free HTTPS URL");
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await resolve(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isUnsafeIp(address))) throw new UnsafeFeedUrlError();
  return url;
}

export interface CapturedContent {
  body: Uint8Array;
  mediaType: string;
  fetchedUrl: string;
}

/** Fetch document bytes for private capture without allowing internal-network requests. */
export async function fetchSafeContent(
  initialUrl: string,
  fetcher: typeof fetch = fetch,
  resolve = lookup,
): Promise<CapturedContent> {
  let url = await checkedUrl(initialUrl, resolve);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "bareaga/1.0 (+private archive capture)", Accept: "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many content redirects");
      url = await checkedUrl(new URL(location, url).toString(), resolve);
      continue;
    }
    if (!response.ok) throw new Error(`Content request failed with status ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_CONTENT_BYTES) throw new Error("Captured content is too large");
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_CONTENT_BYTES) throw new Error("Captured content is too large");
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream";
    if (!new Set(["text/html", "text/plain", "application/xhtml+xml"]).has(mediaType)) {
      throw new Error("Only HTML and plain-text content can be captured");
    }
    return { body, mediaType, fetchedUrl: url.toString() };
  }
  throw new Error("Too many content redirects");
}
