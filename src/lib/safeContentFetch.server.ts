import "server-only";

import { lookup } from "node:dns/promises";
import { fetchValidatedHttps, UnsafeOutboundUrlError, validatedHttpsUrl, type AddressResolver } from "./safeOutboundFetch.server.ts";
import { UnsafeFeedUrlError } from "./safeFeedFetch.server.ts";

const MAX_REDIRECTS = 5;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

export interface CapturedContent {
  body: Uint8Array;
  mediaType: string;
  fetchedUrl: string;
}

async function checkedContentUrl(value: string, resolve: AddressResolver) {
  try {
    return await validatedHttpsUrl(value, resolve);
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError) throw new UnsafeFeedUrlError(error.message);
    throw error;
  }
}

/** Fetch document bytes for private capture without allowing internal-network requests. */
export async function fetchSafeContent(
  initialUrl: string,
  fetcher: typeof fetch | undefined = undefined,
  resolve: AddressResolver = lookup,
): Promise<CapturedContent> {
  let { url, address, family } = await checkedContentUrl(initialUrl, resolve);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const init = {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "coeus/1.0 (+private archive capture)", Accept: "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8" },
    } as const;
    const response = fetcher ? await fetcher(url, init) : await fetchValidatedHttps(url, address, family, init);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many content redirects");
      ({ url, address, family } = await checkedContentUrl(new URL(location, url).toString(), resolve));
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
