import { AsyncLocalStorage } from "node:async_hooks";
import { handleCallback } from "@vercel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const contextKey = Symbol.for("queue-support-probe.context");
const fetchKey = Symbol.for("queue-support-probe.fetch");
const context = globalThis[contextKey] ??= new AsyncLocalStorage();
const log = (event, data = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));

// Record only operation metadata. Receipt values and authentication stay in memory.
function installTrace() {
  if (globalThis[fetchKey]) return;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!/^[a-z0-9]+\.vercel-queue\.com$/.test(url.hostname)) return original(input, init);
    const callback = context.getStore();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    let authEnvironment = null;
    try {
      const jwt = headers.get("authorization")?.split(" ")[1];
      authEnvironment = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).environment ?? null;
    } catch { /* Export only the environment claim, never the token. */ }
    const parts = url.pathname.split("/");
    const leaseIndex = parts.indexOf("lease");
    const operation = leaseIndex !== -1
      ? method === "DELETE" ? "AcknowledgeMessage" : "ExtendLease"
      : parts.includes("id") ? "ReceiveMessageById" : "QueueOperation";
    const receiptMatchesCallback = leaseIndex !== -1 && callback?.receiptHandle
      ? decodeURIComponent(parts[leaseIndex + 1]) === callback.receiptHandle : null;
    const startedAt = new Date().toISOString();
    const response = await original(input, init);
    log("probe.queue.operation", {
      messageId: callback?.messageId ?? null,
      operation,
      method,
      region: url.hostname.split(".")[0],
      topic: parts[4],
      consumerGroup: parts[6],
      deploymentIdHeader: headers.get("vqs-deployment-id"),
      authEnvironment,
      receiptMatchesCallback,
      startedAt,
      status: response.status,
      serviceRequestId: response.headers.get("x-vercel-id"),
    });
    return response;
  };
  globalThis[fetchKey] = true;
}

const callback = handleCallback(async (payload, metadata) => {
  log("probe.handler.start", {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    topic: metadata.topicName,
    consumerGroup: metadata.consumerGroup,
    region: metadata.region,
  });
  // The only accepted payloads are synthetic support probes. There are no app imports.
  if (payload?.probe !== "vercel-queue-support" || !["success", "fail-once"].includes(payload?.mode)) {
    throw new Error("Unsupported synthetic probe");
  }
  if (payload.mode === "fail-once" && metadata.deliveryCount === 1) throw new Error("Intentional first-delivery failure");
  log("probe.handler.complete", { messageId: metadata.messageId, deliveryCount: metadata.deliveryCount });
}, {
  visibilityTimeoutSeconds: 300,
  retry: (error, metadata) => {
    log("probe.callback.error", {
      messageId: metadata.messageId,
      deliveryCount: metadata.deliveryCount,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  },
});

export function POST(request) {
  installTrace();
  const messageId = request.headers.get("ce-vqsmessageid");
  const receiptHandle = request.headers.get("ce-vqsreceipthandle");
  const deadline = request.headers.get("ce-vqsvisibilitydeadline");
  log("probe.callback.start", {
    messageId,
    hasReceiptHandle: receiptHandle !== null,
    visibilityRemainingSeconds: deadline === null ? null : Math.round((Date.parse(deadline) - Date.now()) / 1000),
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  });
  return context.run({ messageId, receiptHandle }, async () => {
    const response = await callback(request);
    const outcome = await response.clone().json();
    log("probe.callback.response", { messageId, httpStatus: response.status, status: outcome.status ?? null, reason: outcome.reason ?? null });
    return response;
  });
}
