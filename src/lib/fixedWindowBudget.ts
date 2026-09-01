export interface BudgetDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  used: number;
  resetAt: number;
}

/** Small process-local guard for expensive endpoints; use a shared store when scaling horizontally. */
export class FixedWindowBudget {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(capacity: number, windowMs: number, maxEntries = 10_000) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  consume(key: string, cost: number, now = Date.now()): BudgetDecision {
    const safeCost = Math.max(1, Math.ceil(cost));
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { used: 0, resetAt: now + this.windowMs };
    }

    const allowed = bucket.used + safeCost <= this.capacity;
    if (allowed) bucket.used += safeCost;
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    this.prune(now);

    return {
      allowed,
      remaining: Math.max(0, this.capacity - bucket.used),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  private prune(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now || this.buckets.size > this.maxEntries) {
        this.buckets.delete(key);
      }
      if (this.buckets.size <= this.maxEntries && bucket.resetAt > now) break;
    }
  }
}
