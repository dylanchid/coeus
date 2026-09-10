import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type AddressResolver = typeof dnsLookup;

export class UnsafeOutboundUrlError extends Error {
  constructor(message = "URL points to a private or otherwise unsafe address") {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

export class OutboundResponseTooLargeError extends Error {
  constructor() {
    super("Outbound response exceeds the configured byte limit");
    this.name = "OutboundResponseTooLargeError";
  }
}

function ipv4IsUnsafe(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) ||
    (a === 192 && b === 168) || (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && c === 113);
}

function ipv6Groups(address: string): number[] | null {
  const [left = "", right = ""] = address.toLowerCase().split("::");
  if (address.split("::").length > 2) return null;
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  if (leftParts.length + rightParts.length > 8) return null;
  const parts = address.includes("::")
    ? [...leftParts, ...Array(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts]
    : leftParts;
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

function ipv6IsUnsafe(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return true;
  const [first, second] = groups;
  if (groups.every((part) => part === 0) ||
    (groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1) ||
    (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 || (first === 0x2001 && second === 0x0db8)) return true;

  // IPv4-compatible and IPv4-mapped literals can encode a private IPv4
  // address without containing dotted decimal text (for example ::ffff:7f00:1).
  const compatible = groups.slice(0, 6).every((part) => part === 0);
  const mapped = groups.slice(0, 5).every((part) => part === 0) && groups[5] === 0xffff;
  if (compatible || mapped) {
    return ipv4IsUnsafe(`${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`);
  }
  return false;
}

export function isUnsafeIp(address: string): boolean {
  return isIP(address) === 4 ? ipv4IsUnsafe(address) : isIP(address) === 6 ? ipv6IsUnsafe(address) : true;
}

export async function validatedHttpsUrl(value: string, resolve: AddressResolver = dnsLookup): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeOutboundUrlError("URL is not valid"); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new UnsafeOutboundUrlError("URL must be a credential-free HTTPS URL");
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) as 4 | 6 }]
    : await resolve(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isUnsafeIp(address))) throw new UnsafeOutboundUrlError();
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

/**
 * A `net`/`https` lookup hook that always resolves to one pre-validated
 * address. Node's autoSelectFamily (default since Node 20) invokes the hook
 * with `{ all: true }` and expects the callback to receive an array of
 * `LookupAddress`; the legacy single-address callback shape then throws
 * "Invalid IP address: undefined". Support both call styles.
 */
export function fixedAddressLookup(address: string, family: 4 | 6) {
  return (_hostname: string, options: { all?: boolean } | ((...args: unknown[]) => void), maybeCallback?: (...args: unknown[]) => void) => {
    const callback = (typeof options === "function" ? options : maybeCallback) as (...args: unknown[]) => void;
    const all = typeof options === "object" && options?.all;
    if (all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

/**
 * Fetch through a DNS answer that was checked immediately beforehand. Passing
 * that answer to https.request's lookup hook prevents a second hostname lookup
 * between validation and connection (the DNS-rebinding window).
 */
function responseHeaders(raw: NodeJS.Dict<string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

/**
 * Fetches over HTTPS against a pre-validated address. `maxBytes === 0` resolves as
 * soon as the response headers arrive and discards the body — use it when only the
 * status and headers matter (e.g. an embed-policy probe) so a large page is never
 * downloaded just to be thrown away.
 */
export async function fetchValidatedHttps(
  url: URL,
  address: string,
  family: 4 | 6,
  init: RequestInit,
  maxBytes = 5 * 1024 * 1024
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
    const request = httpsRequest(url, {
      method: init.method ?? "GET",
      headers,
      lookup: fixedAddressLookup(address, family) as unknown as Parameters<typeof httpsRequest>[1]["lookup"],
      signal: init.signal as AbortSignal | undefined,
    }, (response) => {
      if (maxBytes === 0) {
        const status = response.statusCode ?? 0;
        const collected = responseHeaders(response.headers);
        response.on("error", () => {}); // headers are already in hand; a torn-down body is expected
        response.destroy();
        resolve(new Response(null, { status, headers: collected }));
        return;
      }
      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      response.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          response.destroy(new OutboundResponseTooLargeError());
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode ?? 0,
          headers: responseHeaders(response.headers),
        }));
      });
    });
    request.on("error", reject);
    request.end();
  });
}

export async function fetchSafeHttps(
  value: string,
  init: RequestInit,
  resolve: AddressResolver = dnsLookup,
): Promise<{ response: Response; url: URL }> {
  const { url, address, family } = await validatedHttpsUrl(value, resolve);
  return { response: await fetchValidatedHttps(url, address, family, init), url };
}
