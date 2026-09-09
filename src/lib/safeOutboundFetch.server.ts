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

/** Dotted-decimal IPv4 from two consecutive 16-bit IPv6 groups. */
function ipv4FromGroups(hi: number, lo: number): string {
  return `${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`;
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
    return ipv4IsUnsafe(ipv4FromGroups(groups[6], groups[7]));
  }

  // Transition mechanisms embed an IPv4 address. On a host that actually routes
  // the mechanism, that address can reach a private/loopback target — so
  // extract it and apply the same IPv4 rules (F-30).
  // NAT64 well-known prefix 64:ff9b::/96 (RFC 6052): IPv4 in the last 32 bits.
  if (first === 0x0064 && second === 0xff9b && groups.slice(2, 6).every((part) => part === 0)) {
    return ipv4IsUnsafe(ipv4FromGroups(groups[6], groups[7]));
  }
  // NAT64 local-use prefix 64:ff9b:1::/48 (RFC 8215): synthesised local traffic
  // by definition — reject the whole prefix rather than guess the IPv4 offset.
  if (first === 0x0064 && second === 0xff9b && groups[2] === 0x0001) return true;
  // 6to4 2002::/16 (RFC 3056): the embedded IPv4 is the next 32 bits.
  if (first === 0x2002) return ipv4IsUnsafe(ipv4FromGroups(groups[1], groups[2]));
  // Teredo 2001::/32 (RFC 4380): server IPv4 at bits 32-63, client IPv4
  // (one's-complement obfuscated) at bits 96-127.
  if (first === 0x2001 && second === 0x0000) {
    return ipv4IsUnsafe(ipv4FromGroups(groups[2], groups[3])) ||
      ipv4IsUnsafe(ipv4FromGroups(groups[6] ^ 0xffff, groups[7] ^ 0xffff));
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
export async function fetchValidatedHttps(url: URL, address: string, family: 4 | 6, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
    const request = httpsRequest(url, {
      method: init.method ?? "GET",
      headers,
      lookup: fixedAddressLookup(address, family) as unknown as Parameters<typeof httpsRequest>[1]["lookup"],
      signal: init.signal as AbortSignal | undefined,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 0, headers }));
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
