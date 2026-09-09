/**
 * Reduce a caller-supplied `next` / return-to parameter to a safe same-origin
 * path. The auth callback, the sign-in page, and the welcome form all take a
 * `?next=` from an untrusted URL and then either `Response.redirect` to it or
 * `router.push` it — so it must never be able to name another origin.
 *
 * Client-safe (no `server-only`, no node built-ins): the welcome form is a
 * client component.
 *
 * The old inline check (`startsWith("/") && !startsWith("//")`) is defeated by
 * `/\evil.com`: WHATWG treats `\` as `/` in a special-scheme URL, so
 * `new URL("/\\evil.com", origin)` resolves to `https://evil.com/`. This
 * rejects backslashes, whitespace, and control characters outright, then
 * confirms the value still resolves to our own origin before returning just
 * its path + query.
 */

// Control characters (0x00–0x1F), space (0x20), DEL (0x7F), and backslash (0x5C).
const UNSAFE_IN_PATH = /[\x00-\x20\x7f\x5c]/;

export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  // A single rooted path only: "/" then a character that is not "/" or "\".
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return fallback;
  if (UNSAFE_IN_PATH.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://internal.invalid") return fallback;
  const path = `${url.pathname}${url.search}`;
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
