/**
 * Pure queue-message timing, shared by the consumer route (which logs it) and
 * the log-threshold evaluator (which alerts on it). Kept free of @vercel/queue
 * so scripts can import it.
 */
export const RETENTION_NEAR_DEADLINE_EVENT = "destination_delivery.queue.retention_near_deadline";
/** Share of the retention window already consumed before a message is flagged / paged. */
export const RETENTION_WARN_RATIO = 0.5;
export const RETENTION_PAGE_RATIO = 0.8;

export interface QueueMessageTiming {
  createdAt: Date;
  expiresAt: Date;
  deliveryCount: number;
}

export interface QueueMessageHealth {
  ageSeconds: number;
  retries: number;
  retentionRemainingSeconds: number;
  /** 0 at publish, 1 at expiry. */
  retentionUsedRatio: number;
}

export function queueMessageHealth(message: QueueMessageTiming, now: Date = new Date()): QueueMessageHealth {
  const totalSeconds = Math.max(1, (message.expiresAt.getTime() - message.createdAt.getTime()) / 1000);
  const ageSeconds = Math.max(0, (now.getTime() - message.createdAt.getTime()) / 1000);
  return {
    ageSeconds: Math.round(ageSeconds),
    retries: Math.max(0, message.deliveryCount - 1),
    retentionRemainingSeconds: Math.max(0, Math.round((message.expiresAt.getTime() - now.getTime()) / 1000)),
    retentionUsedRatio: Math.min(1, Math.round((ageSeconds / totalSeconds) * 1000) / 1000),
  };
}

export function isNearRetentionDeadline(health: QueueMessageHealth): boolean {
  return health.retentionUsedRatio >= RETENTION_WARN_RATIO;
}
