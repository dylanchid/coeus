/**
 * Minimal structured logging for destination delivery. A full observability
 * boundary is tracked separately (bareaga_web-hwg.14); this is the narrow slice
 * delivery needs now: one JSON line per event, a correlation id threaded through
 * a run, and a defensive redaction pass so a token or archive body can never
 * reach the logs even if a caller passes the wrong field.
 */

const SENSITIVE_KEY = /secret|token|authorization|ciphertext|password|cookie/i;

export function newCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Drop obviously-sensitive keys and truncate long strings; never recurse into archive item bodies. */
export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  return out;
}

export interface DeliveryLogFields {
  correlationId: string;
  [key: string]: unknown;
}

export function logDelivery(event: string, fields: DeliveryLogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...redact(fields) });
  if (event.endsWith(".error")) console.error(line);
  else console.info(line);
}
