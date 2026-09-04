import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 5;
const MAX_FEED_BYTES = 2 * 1024 * 1024;

export class UnsafeFeedUrlError extends Error {
  constructor(message = "Feed URL points to a private or otherwise unsafe address") {
    super(message);
    this.name = "UnsafeFeedUrlError";
  }
}

function ipv4IsUnsafe(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && b >= 18 && b <= 19);
}

function ipv6IsUnsafe(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:192.168.") || normalized.startsWith("::ffff:169.254.");
}

export function isUnsafeIp(address: string): boolean {
  return isIP(address) === 4 ? ipv4IsUnsafe(address) : isIP(address) === 6 ? ipv6IsUnsafe(address) : true;
}

async function assertSafeUrl(value: string, resolve = lookup): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeFeedUrlError("Feed URL is not valid"); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new UnsafeFeedUrlError("Feed URL must be a credential-free HTTPS URL");
  }
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await resolve(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isUnsafeIp(address))) throw new UnsafeFeedUrlError();
  return url;
}

export async function fetchFeedText(initialUrl: string, fetcher: typeof fetch = fetch, resolve = lookup): Promise<string> {
  let url = await assertSafeUrl(initialUrl, resolve);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetcher(url, {
      redirect: "manual", signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "bareaga/1.0 (+local news reader)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many feed redirects");
      url = await assertSafeUrl(new URL(location, url).toString(), resolve);
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
