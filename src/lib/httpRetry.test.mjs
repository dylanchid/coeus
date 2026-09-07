import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithRetry, isRetryableStatus } from "./httpRetry.ts";

const noSleep = async () => {};
const fixedJitter = () => 1;

function jsonResponse(status, body = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("isRetryableStatus covers the transient set only", () => {
  for (const status of [429, 502, 503, 504]) assert.equal(isRetryableStatus(status), true);
  for (const status of [200, 400, 401, 404, 409, 500]) assert.equal(isRetryableStatus(status), false);
});

test("a successful response is returned on the first attempt", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return jsonResponse(200, { ok: true });
  };
  const response = await fetchWithRetry(fetcher, "https://example.test", undefined, { sleep: noSleep });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
});

test("a 429 is retried and then succeeds", async () => {
  const statuses = [429, 429, 200];
  let calls = 0;
  const fetcher = async () => jsonResponse(statuses[calls++]);
  const response = await fetchWithRetry(fetcher, "https://example.test", undefined, {
    retries: 2,
    sleep: noSleep,
    random: fixedJitter,
  });
  assert.equal(calls, 3);
  assert.equal(response.status, 200);
});

test("retries are bounded: the last retryable response is returned", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return jsonResponse(503);
  };
  const response = await fetchWithRetry(fetcher, "https://example.test", undefined, {
    retries: 2,
    sleep: noSleep,
    random: fixedJitter,
  });
  assert.equal(calls, 3);
  assert.equal(response.status, 503);
});

test("Retry-After seconds header is honoured over computed backoff", async () => {
  const waits = [];
  const sleep = async (ms) => {
    waits.push(ms);
  };
  let calls = 0;
  const fetcher = async () =>
    calls++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : jsonResponse(200);
  await fetchWithRetry(fetcher, "https://example.test", undefined, { retries: 1, sleep, random: fixedJitter });
  assert.deepEqual(waits, [2000]);
});

test("network errors are retried then rethrown after the budget", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    throw new Error("ECONNRESET");
  };
  await assert.rejects(
    fetchWithRetry(fetcher, "https://example.test", undefined, { retries: 2, sleep: noSleep, random: fixedJitter }),
    /ECONNRESET/
  );
  assert.equal(calls, 3);
});

test("each attempt is given an AbortSignal", async () => {
  let seenSignal;
  const fetcher = async (_input, init) => {
    seenSignal = init?.signal;
    return jsonResponse(200);
  };
  await fetchWithRetry(fetcher, "https://example.test", { method: "POST" }, { sleep: noSleep });
  assert.ok(seenSignal instanceof AbortSignal);
});

test("a per-attempt timeout aborts a hanging request", async () => {
  const fetcher = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  await assert.rejects(
    fetchWithRetry(fetcher, "https://example.test", undefined, { timeoutMs: 5, retries: 0, sleep: noSleep }),
    /abort/i
  );
});
