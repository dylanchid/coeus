import assert from "node:assert/strict";
import test from "node:test";

import { instrument, redact, requestCorrelationId, scrubMessage, statusClass } from "./serverLog.ts";

function captureLogs(fn) {
  const lines = [];
  const info = console.info;
  const error = console.error;
  console.info = (line) => lines.push({ level: "info", line });
  console.error = (line) => lines.push({ level: "error", line });
  return Promise.resolve()
    .then(fn)
    .finally(() => { console.info = info; console.error = error; })
    .then(() => lines.map((entry) => ({ level: entry.level, ...JSON.parse(entry.line) })));
}

test("redact drops sensitive keys, truncates long strings, and flattens objects", () => {
  const out = redact({
    correlationId: "cid",
    ownerId: "user-1",
    secretKey: "sk_live_abcd",
    accessToken: "tok",
    note: "a private note",
    body: "captured content",
    long: "x".repeat(500),
    payload: { a: 1 },
    list: [1, 2, 3],
    count: 4,
    ok: true,
    missing: undefined,
  });
  assert.equal(out.ownerId, "user-1");
  assert.equal(out.secretKey, "[redacted]");
  assert.equal(out.accessToken, "[redacted]");
  assert.equal(out.note, "[redacted]");
  assert.equal(out.body, "[redacted]");
  assert.equal(out.long.length, 301); // 300 chars + ellipsis
  assert.equal(out.payload, "[object]");
  assert.equal(out.list, "[array(3)]");
  assert.equal(out.count, 4);
  assert.equal(out.ok, true);
  assert.ok(!("missing" in out));
});

test("statusClass buckets codes and treats a no-status result as 2xx", () => {
  assert.equal(statusClass(200), "2xx");
  assert.equal(statusClass(404), "4xx");
  assert.equal(statusClass(503), "5xx");
  assert.equal(statusClass(undefined), "2xx");
});

test("requestCorrelationId prefers an upstream id, else mints one", () => {
  const withHeader = requestCorrelationId({ headers: { get: (name) => (name === "x-request-id" ? "req-9" : null) } });
  assert.equal(withHeader, "req-9");
  const minted = requestCorrelationId({ headers: { get: () => null } });
  assert.match(minted, /[0-9a-f-]{8,}/);
});

test("instrument logs a success signal with duration and status class", async () => {
  const logs = await captureLogs(async () => {
    const result = await instrument(
      { route: "archive.sync", operation: "handleArchiveSync", correlationId: "cid-1", fields: { ownerId: "u1" } },
      async () => ({ status: 429 })
    );
    assert.deepEqual(result, { status: 429 });
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, "archive.sync.handleArchiveSync");
  assert.equal(logs[0].statusClass, "4xx");
  assert.equal(logs[0].correlationId, "cid-1");
  assert.equal(logs[0].ownerId, "u1");
  assert.equal(typeof logs[0].durationMs, "number");
});

test("instrument logs an error signal and rethrows, scrubbing the message", async () => {
  const logs = await captureLogs(async () => {
    await assert.rejects(
      instrument({ route: "account", operation: "delete", correlationId: "cid-2" }, async () => {
        throw new TypeError("delete failed: token=sk_live_abcdef123456");
      }),
      /delete failed/
    );
  });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, "error");
  assert.equal(logs[0].event, "account.delete.error");
  assert.equal(logs[0].statusClass, "error");
  assert.equal(logs[0].errorName, "TypeError");
  assert.doesNotMatch(logs[0].errorMessage, /sk_live_abcdef123456/);
  assert.ok(!("stack" in logs[0]));
});

test("scrubMessage removes credential-shaped substrings", () => {
  assert.match(scrubMessage("connect failed secret=abc123"), /secret=\[redacted\]/);
  assert.doesNotMatch(scrubMessage("sent Bearer sk_live_topsecretvalue to api"), /topsecret/);
  assert.doesNotMatch(scrubMessage("token eyJhbGciOiJI.eyJzdWIiOiIxIn0.abc123 rejected"), /eyJzdWIiOiIxIn0/);
  assert.match(scrubMessage(`key ${"a".repeat(50)} rejected`), /\[redacted\]/);
  assert.equal(scrubMessage("plain timeout after 5000ms"), "plain timeout after 5000ms");
});
