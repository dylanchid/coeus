import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLogThresholds, parseVercelLogLines, worstSeverity } from "./logThresholds.ts";

const ok = (route, n, extra = {}) =>
  Array.from({ length: n }, () => ({ event: `${route}.op`, route, statusClass: "2xx", ...extra }));
const err = (route, n) =>
  Array.from({ length: n }, () => ({ event: `${route}.op.error`, route, statusClass: "error" }));

test("clean window produces no breaches", () => {
  const breaches = evaluateLogThresholds({ windowMinutes: 15, logs: ok("collections", 100), requests: [] });
  assert.deepEqual(breaches, []);
  assert.equal(worstSeverity(breaches), null);
});

test("a single error on a low-traffic route does not trip the rate signal", () => {
  const breaches = evaluateLogThresholds({ windowMinutes: 15, logs: [...ok("likes", 4), ...err("likes", 1)] });
  assert.deepEqual(breaches, []);
});

test("error rate above 1% over enough samples warns", () => {
  const breaches = evaluateLogThresholds({ windowMinutes: 15, logs: [...ok("posts", 96), ...err("posts", 4)] });
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0].severity, "warn");
  assert.match(breaches[0].signal, /posts error rate/);
});

test("error rate above 5% pages", () => {
  const breaches = evaluateLogThresholds({ windowMinutes: 5, logs: [...ok("posts", 80), ...err("posts", 20)] });
  assert.equal(worstSeverity(breaches), "page");
});

test("archive.sync 5xx rate and p95 duration are evaluated independently", () => {
  const logs = [
    ...Array.from({ length: 18 }, () => ({ event: "archive.sync.h", route: "archive.sync", statusClass: "2xx", durationMs: 800 })),
    ...Array.from({ length: 2 }, () => ({ event: "archive.sync.h", route: "archive.sync", statusClass: "5xx", durationMs: 9000 })),
  ];
  const breaches = evaluateLogThresholds({ windowMinutes: 15, logs });
  const signals = breaches.map((b) => b.signal).sort();
  assert.deepEqual(signals, ["archive.sync 5xx rate", "archive.sync p95 durationMs"]);
  assert.equal(breaches.find((b) => b.signal === "archive.sync p95 durationMs").severity, "page");
});

test("health non-200 warns once, pages when sustained", () => {
  const one = evaluateLogThresholds({ windowMinutes: 15, logs: [], requests: [{ path: "/api/health", statusCode: 503 }] });
  assert.equal(one[0].severity, "warn");

  const many = evaluateLogThresholds({
    windowMinutes: 15,
    logs: [],
    requests: [
      { path: "/api/health", statusCode: 503 },
      { path: "/api/health?probe=1", statusCode: 500 },
    ],
  });
  assert.equal(many[0].severity, "page");
});

test("destination delivery errors are normalised to an hourly rate", () => {
  const logs = Array.from({ length: 3 }, () => ({ event: "destination_delivery.destination.error" }));
  // 3 errors in a 15m window ~= 12/h -> warn
  const breaches = evaluateLogThresholds({ windowMinutes: 15, logs });
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0].severity, "warn");
});

const structured = (event, extra = {}) => JSON.stringify({ ts: "2026-10-15T20:28:31.833Z", event, ...extra });

test("parses flat CLI records, including every nested log message", () => {
  const line = JSON.stringify({
    id: "78v28",
    level: "info",
    message: structured("archive.sync.handleArchiveSync", { route: "archive.sync", statusClass: "2xx", durationMs: 337 }),
    requestPath: "/api/archive/sync",
    responseStatusCode: 200,
    logs: [
      { level: "info", message: structured("archive.sync.handleArchiveSync", { route: "archive.sync", statusClass: "2xx", durationMs: 337 }) },
      { level: "info", message: structured("destination_delivery.queue.enqueued") },
    ],
  });
  const parsed = parseVercelLogLines([line]);
  assert.deepEqual(parsed.requests, [{ path: "/api/archive/sync", statusCode: 200 }]);
  assert.deepEqual(parsed.logs.map((l) => l.event), ["archive.sync.handleArchiveSync", "destination_delivery.queue.enqueued"]);
  assert.equal(parsed.logs[0].durationMs, 337);
  assert.equal(parsed.records, 1);
  assert.equal(parsed.recognized, 1);
  assert.equal(parsed.truncated, false);
});

test("parses the CLI 64 envelope and flags a truncated window", () => {
  const lines = [
    JSON.stringify({ type: "log", data: { requestPath: "/api/feeds", responseStatusCode: 500, message: structured("feeds.GET", { route: "feeds", statusClass: "error" }) } }),
    JSON.stringify({ type: "summary", recordsReturned: 1, pagination: { hasMore: true, next: "cursor" } }),
  ];
  const parsed = parseVercelLogLines(lines);
  assert.deepEqual(parsed.requests, [{ path: "/api/feeds", statusCode: 500 }]);
  assert.equal(parsed.logs[0].statusClass, "error");
  assert.equal(parsed.records, 1);
  assert.equal(parsed.truncated, true);
});

test("an unknown record shape is counted but not recognized", () => {
  const parsed = parseVercelLogLines([JSON.stringify({ type: "log", data: { body: { msg: "x" } } }), "not json", ""]);
  assert.equal(parsed.records, 1);
  assert.equal(parsed.recognized, 0);
  assert.deepEqual(parsed.logs, []);
  assert.deepEqual(parsed.requests, []);
});

test("plain-text messages and string status codes are tolerated", () => {
  const parsed = parseVercelLogLines([JSON.stringify({ path: "/", statusCode: "304", message: "GET / 304" })]);
  assert.deepEqual(parsed.requests, [{ path: "/", statusCode: 304 }]);
  assert.deepEqual(parsed.logs, []);
  assert.equal(parsed.recognized, 1);
});

test("reads httpStatus from CLI 64 request records", () => {
  const lines = [
    JSON.stringify({ type: "log", data: { requestPath: "/api/feeds", message: structured("feeds.GET", { route: "feeds", statusClass: "2xx" }) } }),
    JSON.stringify({ type: "summary", recordsReturned: 1, pagination: { hasMore: false } }),
    JSON.stringify({ type: "request", data: { requestPath: "/api/feeds", requestMethod: "GET", httpStatus: 502 } }),
    JSON.stringify({ type: "summary", recordsReturned: 1, pagination: { hasMore: false } }),
  ];
  const parsed = parseVercelLogLines(lines);
  assert.deepEqual(parsed.requests, [{ path: "/api/feeds", statusCode: 502 }]);
  assert.equal(parsed.logs.length, 1);
  assert.equal(parsed.records, 2);
  assert.equal(parsed.recognized, 2);
  assert.equal(parsed.truncated, false);
});
