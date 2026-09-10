import { lookup } from "node:dns/promises";
import { fetchValidatedHttps, isUnsafeIp, UnsafeOutboundUrlError, validatedHttpsUrl, type AddressResolver } from "./safeOutboundFetch.server.ts";

const MAX_REDIRECTS = 5;
const MAX_FEED_BYTES = 2 * 1024 * 1024;

export { isUnsafeIp };
/** Backward-compatible name for callers that display feed-specific errors. */
export const UnsafeFeedUrlError = UnsafeOutboundUrlError;

async function checkedFeedUrl(value: string, resolve: AddressResolver) {
  try {
    return await validatedHttpsUrl(value, resolve);
  } catch (error) {
    if (error instanceof UnsafeOutboundUrlError) throw new UnsafeFeedUrlError(error.message);
    throw error;
  }
}

export async function fetchFeedText(initialUrl: string, fetcher: typeof fetch | undefined = undefined, resolve: AddressResolver = lookup): Promise<string> {
  let { url, address, family } = await checkedFeedUrl(initialUrl, resolve);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const init = {
      redirect: "manual", signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "coeus/1.0 (+local news reader)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    } as const;
    const response = fetcher ? await fetcher(url, init) : await fetchValidatedHttps(url, address, family, init, MAX_FEED_BYTES);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many feed redirects");
      ({ url, address, family } = await checkedFeedUrl(new URL(location, url).toString(), resolve));
      continue;
    }
    if (!response.ok) throw new Error(`status ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_FEED_BYTES) throw new Error("Feed response is too large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_FEED_BYTES) throw new Error("Feed response is too large");
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Too many feed redirects");
}
