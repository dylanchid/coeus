import type { SourceFeed } from "./types";

type Entry = {
  sources: SourceFeed[];
  updatedAt: string;
  savedAt: number;
};

const memory = new Map<string, Entry>();
const CLIENT_FRESH_MS = 60_000;

export function clientCacheKey(parts: {
  ids: string;
  limit: number;
  hours: number;
  topic: string;
}): string {
  return `${parts.topic}|${parts.limit}|${parts.hours}|${parts.ids}`;
}

export function readClientCache(key: string): Entry | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.savedAt > CLIENT_FRESH_MS) return null;
  return hit;
}

export function writeClientCache(
  key: string,
  data: { sources: SourceFeed[]; updatedAt: string }
): void {
  memory.set(key, { ...data, savedAt: Date.now() });
  // Bound memory
  if (memory.size > 20) {
    const oldest = [...memory.entries()].sort(
      (a, b) => a[1].savedAt - b[1].savedAt
    )[0];
    if (oldest) memory.delete(oldest[0]);
  }
}

/** Split ids into chunks for progressive loading. */
export function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}
