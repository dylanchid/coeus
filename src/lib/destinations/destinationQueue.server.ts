import { randomUUID } from "node:crypto";
import { QueueClient } from "@vercel/queue";
import { logDelivery } from "../deliveryLog.ts";
import { MAX_ITEMS_PER_TICK, type WorkerTickResult } from "./destinationWorker.server.ts";

export const DESTINATION_DELIVERY_QUEUE = "destination_delivery";

export interface DestinationDeliveryRequest {
  requestId: string;
  ownerId: string;
  correlationId: string;
}

type QueueSendOptions = { idempotencyKey: string; delaySeconds?: number };
type QueueSend = (topic: string, payload: DestinationDeliveryRequest, options: QueueSendOptions) => Promise<unknown>;
type TickRunner = (ownerId: string, correlationId: string) => Promise<WorkerTickResult>;
type FollowUpEnqueue = (next: DestinationDeliveryRequest, options?: { delaySeconds?: number }) => Promise<boolean>;

export const DESTINATION_RETRY_DELAY_SECONDS = 60;

// Explicit local fallback avoids the SDK's build-time region warning. Vercel
// supplies VERCEL_REGION in deployed functions, and callback delivery carries
// its own queue region metadata.
const queue = new QueueClient({ region: process.env.VERCEL_REGION ?? "iad1" });

export function destinationQueueEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DESTINATION_QUEUE_ENABLED === "1";
}

export function isDestinationDeliveryRequest(value: unknown): value is DestinationDeliveryRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some((key) => key !== "requestId" && key !== "ownerId" && key !== "correlationId")) return false;
  return ["requestId", "ownerId", "correlationId"].every((key) => typeof request[key] === "string" && request[key].length > 0 && request[key].length <= 200);
}

export function newDestinationDeliveryRequest(ownerId: string, correlationId: string): DestinationDeliveryRequest {
  return { requestId: randomUUID(), ownerId, correlationId };
}

/** Publish only a compact wake-up request; snapshots and credentials stay in Supabase. */
export async function enqueueDestinationDelivery(
  request: DestinationDeliveryRequest,
  options: { enabled?: boolean; send?: QueueSend; delaySeconds?: number } = {}
): Promise<boolean> {
  if (!(options.enabled ?? destinationQueueEnabled())) return false;
  const send = options.send ?? queue.send;
  await send(DESTINATION_DELIVERY_QUEUE, request, {
    idempotencyKey: `destination-delivery:${request.requestId}`,
    ...(options.delaySeconds === undefined ? {} : { delaySeconds: options.delaySeconds }),
  });
  logDelivery("destination_delivery.queue.enqueued", { correlationId: request.correlationId, ownerId: request.ownerId, requestId: request.requestId });
  return true;
}

/**
 * Queue consumers run the existing bounded worker. A full 100-item batch
 * schedules an immediate wake-up; retryable failures and lease contention
 * schedule a delayed wake-up. Auth failures stop the chain after marking.
 */
export async function processDestinationDeliveryRequest(
  request: DestinationDeliveryRequest,
  options: { enabled?: boolean; runTick: TickRunner; enqueue?: FollowUpEnqueue }
): Promise<WorkerTickResult | null> {
  if (!(options.enabled ?? destinationQueueEnabled())) return null;
  const result = await options.runTick(request.ownerId, request.correlationId);
  const hasFullBatch = result.results.some((summary) => summary.delivered >= MAX_ITEMS_PER_TICK && !summary.authError);
  const hasRetryableFailure = result.results.some((summary) => !summary.authError && (summary.failed > 0 || summary.status === "failed"));
  const hasLeaseContention = result.skipped > 0;
  const hasUnscopedFailure = result.failures.length > 0 && result.results.length === 0;
  if (hasFullBatch || hasRetryableFailure || hasLeaseContention || hasUnscopedFailure) {
    const next = newDestinationDeliveryRequest(request.ownerId, request.correlationId);
    const delaySeconds = hasRetryableFailure || hasLeaseContention || hasUnscopedFailure ? DESTINATION_RETRY_DELAY_SECONDS : undefined;
    const enqueue = options.enqueue ?? ((nextRequest, enqueueOptions) => enqueueDestinationDelivery(nextRequest, enqueueOptions));
    await enqueue(next, delaySeconds === undefined ? undefined : { delaySeconds });
  }
  return result;
}
