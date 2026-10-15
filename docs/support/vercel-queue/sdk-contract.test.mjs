import assert from "node:assert/strict";
import test from "node:test";
import { QueueClient } from "@vercel/queue";

// All headers, payloads and credentials in this file are synthetic.
const receipt = "synthetic-receipt+with/slash%";
function request(withReceipt) {
  return new Request("https://synthetic.invalid/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "ce-type": "com.vercel.queue.v2beta",
      "ce-vqsqueuename": "synthetic_topic",
      "ce-vqsconsumergroup": "synthetic_group",
      "ce-vqsmessageid": "synthetic-message",
      "ce-vqsregion": "iad1",
      ...(withReceipt ? {
        "ce-vqsreceipthandle": receipt,
        "ce-vqsvisibilitydeadline": new Date(Date.now() + 300_000).toISOString(),
      } : {}),
    },
    body: JSON.stringify({ probe: true }),
  });
}

test("SDK 0.8.0 callback settlement contract", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDebug = console.debug;
  const originalError = console.error;
  console.debug = () => {};
  console.error = () => {};
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.debug = originalDebug;
    console.error = originalError;
  });
  const client = new QueueClient({ region: "iad1", deploymentId: "dpl_synthetic", token: "synthetic-test-token" });

  await t.test("active push receipt is forwarded unchanged; ack 409 becomes HTTP 200 skipped", async () => {
    const events = [];
    globalThis.fetch = async (url, init) => {
      events.push("ack");
      assert.equal(init.method, "DELETE");
      assert.equal(url, `https://iad1.vercel-queue.com/api/v3/topic/synthetic_topic/consumer/synthetic_group/lease/${encodeURIComponent(receipt)}`);
      assert.equal(init.headers.get("Vqs-Deployment-Id"), "dpl_synthetic");
      return Response.json({ error: "Message is not currently in-flight" }, { status: 409 });
    };
    const callback = client.handleCallback(async () => { events.push("handler"); }, {
      visibilityTimeoutSeconds: 300,
      retry: (error) => {
        events.push("retry");
        assert.equal(error.name, "MessageNotAvailableError");
      },
    });
    const response = await callback(request(true));
    assert.deepEqual(events, ["handler", "ack", "retry"]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "skipped", reason: "not_available", messageId: "synthetic-message" });
  });

  await t.test("callback without receipt fetches by ID; receive 404 prevents handler and retry hook", async () => {
    let handlerCalls = 0;
    let retryCalls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(init.method, "POST");
      assert.equal(url, "https://iad1.vercel-queue.com/api/v3/topic/synthetic_topic/consumer/synthetic_group/id/synthetic-message");
      assert.equal(init.headers.get("Vqs-Visibility-Timeout-Seconds"), "300");
      return Response.json({ error: "Message not found" }, { status: 404 });
    };
    const callback = client.handleCallback(async () => { handlerCalls++; }, { retry: () => { retryCalls++; } });
    const response = await callback(request(false));
    assert.equal(response.status, 500);
    assert.equal(handlerCalls, 0);
    assert.equal(retryCalls, 0);
  });

  await t.test("successful ack produces the documented success response", async () => {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.method, "DELETE");
      return new Response(null, { status: 204 });
    };
    const callback = client.handleCallback(async () => {});
    const response = await callback(request(true));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "success" });
  });
});
