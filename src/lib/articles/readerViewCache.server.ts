import { createHash } from "node:crypto";

import { del, get, list, put } from "@vercel/blob";

import type { ReaderView } from "./readerView.ts";

export const READER_VIEW_CACHE_MS = 60 * 60 * 1_000;
const CACHE_PREFIX = "coeus-reader-view/v1";

type CachedReaderView = { expiresAt: number; reader: ReaderView };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normaliseHostname(hostname: string): string | null {
  const domain = hostname.trim().toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ? domain : null;
}

export function readerViewCachePath(urlValue: string): string | null {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:") return null;
    const hostname = normaliseHostname(url.hostname);
    return hostname ? `${CACHE_PREFIX}/${hostname}/${hash(url.toString())}.json` : null;
  } catch {
    return null;
  }
}

function configured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Reads a short-lived private Blob entry. Local development works without a Blob store. */
export async function getCachedReaderView(urlValue: string): Promise<ReaderView | null> {
  if (!configured()) return null;
  const pathname = readerViewCachePath(urlValue);
  if (!pathname) return null;
  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const cached = await new Response(result.stream).json() as CachedReaderView;
    if (!cached || cached.expiresAt <= Date.now() || !cached.reader) {
      void del(pathname).catch(() => undefined);
      return null;
    }
    return cached.reader;
  } catch {
    return null;
  }
}

/** Writes a private, one-hour reader excerpt. Blob failure never blocks the preview. */
export async function cacheReaderView(urlValue: string, reader: ReaderView): Promise<void> {
  if (!configured()) return;
  const pathname = readerViewCachePath(urlValue);
  if (!pathname) return;
  try {
    await put(pathname, JSON.stringify({ expiresAt: Date.now() + READER_VIEW_CACHE_MS, reader } satisfies CachedReaderView), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: READER_VIEW_CACHE_MS / 1_000,
      contentType: "application/json; charset=utf-8",
    });
  } catch {
    // The in-process cache remains a short-lived resilience layer.
  }
}

/** Removes every persisted reader excerpt for a verified publisher domain. */
export async function purgeCachedReaderViewsForDomain(hostname: string): Promise<number> {
  if (!configured()) return 0;
  const domain = normaliseHostname(hostname);
  if (!domain) throw new Error("Expected a hostname");
  let cursor: string | undefined;
  let removed = 0;
  do {
    const page = await list({ prefix: `${CACHE_PREFIX}/`, cursor, limit: 1_000 });
    const matching = page.blobs
      .map((blob) => blob.pathname)
      .filter((pathname) => readerViewCachePathBelongsToDomain(pathname, domain));
    if (matching.length) {
      await del(matching);
      removed += matching.length;
    }
    cursor = page.cursor;
  } while (cursor);
  return removed;
}

export function readerViewCachePathBelongsToDomain(pathname: string, domain: string): boolean {
  const prefix = `${CACHE_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return false;
  const hostname = pathname.slice(prefix.length).split("/", 1)[0];
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
