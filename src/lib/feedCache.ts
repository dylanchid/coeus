import type { SourceDef } from "./types.ts";

/**
 * A feed's id is user-controlled for custom feeds, so it is not sufficient as
 * a process-cache key. The URL is the immutable fetch identity after the
 * request contract has validated it.
 */
export function feedCacheKey(source: Pick<SourceDef, "id" | "feedUrl">): string {
  return `${source.id}\u0000${source.feedUrl}`;
}

/**
 * Small LRU map for process-local data. Reading an entry refreshes its
 * recency, and inserting beyond capacity evicts the least-recently-used key.
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, V>();
  private readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("BoundedCache capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
