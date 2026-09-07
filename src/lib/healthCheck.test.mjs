import assert from "node:assert/strict";
import test from "node:test";

import { runHealthChecks } from "./healthCheck.ts";

test("all probes passing yields status ok", async () => {
  const report = await runHealthChecks({
    config: async () => {},
    database: async () => {},
  });
  assert.equal(report.status, "ok");
  assert.equal(report.checks.length, 2);
  assert.ok(report.checks.every((check) => check.ok));
  assert.equal(typeof report.durationMs, "number");
});

test("a failing probe degrades the report and records only the error class name", async () => {
  const report = await runHealthChecks({
    config: async () => {},
    database: async () => { throw new TypeError("connection string postgres://user:pw@host/db refused"); },
  });
  assert.equal(report.status, "degraded");
  const database = report.checks.find((check) => check.name === "database");
  assert.equal(database.ok, false);
  assert.equal(database.detail, "TypeError");
  assert.doesNotMatch(JSON.stringify(report), /postgres:\/\//);
});

test("every probe runs even when an earlier one fails", async () => {
  const ran = [];
  const report = await runHealthChecks({
    a: async () => { ran.push("a"); throw new Error("x"); },
    b: async () => { ran.push("b"); },
  });
  assert.deepEqual(ran, ["a", "b"]);
  assert.equal(report.status, "degraded");
});
