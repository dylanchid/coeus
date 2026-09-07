/**
 * Destination-delivery logging. The shared observability boundary lives in
 * `serverLog.ts`; this keeps the delivery-specific event name helper so the
 * worker and its routes read cohesively.
 */
import { logEvent, newCorrelationId, redact, type LogFields } from "./serverLog.ts";

export { newCorrelationId, redact };
export type DeliveryLogFields = LogFields;

export function logDelivery(event: string, fields: LogFields): void {
  logEvent(event, fields);
}
