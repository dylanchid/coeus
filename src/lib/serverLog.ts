/**
 * The server observability boundary: one structured JSON line per event, a
 * correlation id threaded through a request or job, a timing/instrumentation
 * wrapper, and a defensive redaction pass so secrets, tokens, private notes,
 * captured content, or raw personal data can never reach the logs even when a
 * caller passes the wrong field.
 *
 * Client responses are unaffected — routes keep returning their existing
 * non-sensitive bodies; this only adds diagnosable server-side signal.
 */

const SENSITIVE_KEY = /secret|token|authorization|ciphertext|password|cookie|note|body|content|email|snapshot|jwt|key$/i;
const MAX_STRING = 300;

export function newCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Derive a correlation id for a request: prefer an upstream/edge id so logs
 * correlate across hops, otherwise mint one.
 */
export function requestCorrelationId(request: { headers: { get(name: string): string | null } }): string {
  return (
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    request.headers.get("x-vercel-id") ??
    newCorrelationId()
  );
}

/** Drop sensitive keys and truncate long strings. Never recurses into nested objects/arrays — pass scalars. */
export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
    } else if (value === null || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      // Objects/arrays are not logged structurally; record only their shape.
      out[key] = Array.isArray(value) ? `[array(${value.length})]` : "[object]";
    }
  }
  return out;
}

export interface LogFields {
  correlationId: string;
  [key: string]: unknown;
}

/**
 * Strip credential-shaped substrings from a free-text error message before it
 * is logged: `secret=…`, `token: …`, `Bearer …`, `apikey=…`, and long
 * base64/hex blobs that look like keys.
 */
export function scrubMessage(message: string): string {
  return message
    .replace(/\bey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[redacted-jwt]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(secret|token|api[_-]?key|password|authorization)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

/** `2xx`/`4xx`/`5xx` bucket for a status code; a resolved op with no HTTP status counts as `2xx`. Thrown failures are logged as `error` by `instrument`. */
export function statusClass(status?: number): string {
  if (status === undefined) return "2xx";
  return `${Math.floor(status / 100)}xx`;
}

export function logEvent(event: string, fields: LogFields): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...redact(fields) });
  if (event.endsWith(".error") || event.endsWith(".failure")) console.error(line);
  else console.info(line);
}

export interface InstrumentContext {
  route: string;
  operation: string;
  correlationId: string;
  /** Extra safe identifiers (ids, kinds, counts) merged into every emitted line. */
  fields?: Record<string, unknown>;
}

/**
 * Time an async operation and emit a success or failure signal with
 * `route`, `operation`, `durationMs`, `statusClass`, and `correlationId`.
 * A thrown error is logged (message + name only) and rethrown, so the route's
 * own error mapping and non-sensitive response are unchanged.
 */
export async function instrument<T>(context: InstrumentContext, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const status = typeof (result as { status?: unknown })?.status === "number" ? (result as { status: number }).status : undefined;
    logEvent(`${context.route}.${context.operation}`, {
      correlationId: context.correlationId,
      route: context.route,
      operation: context.operation,
      durationMs: Date.now() - startedAt,
      statusClass: statusClass(status),
      ...context.fields,
    });
    return result;
  } catch (error) {
    logEvent(`${context.route}.${context.operation}.error`, {
      correlationId: context.correlationId,
      route: context.route,
      operation: context.operation,
      durationMs: Date.now() - startedAt,
      statusClass: "error",
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: scrubMessage(error instanceof Error ? error.message : String(error)),
      ...context.fields,
    });
    throw error;
  }
}
