import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLogThresholds, worstSeverity } from "./logThresholds.ts";

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
