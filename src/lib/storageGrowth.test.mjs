import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStorageGrowth } from "./storageGrowth.ts";

const WEEK_AGO = "2026-09-01T06:00:00Z";
const NOW = "2026-09-08T06:00:00Z";

test("no baseline yet — the first capture never breaches", () => {
  assert.equal(
    evaluateStorageGrowth({ currentBytes: 1_000_000, currentAt: NOW, previousBytes: null, previousAt: null }),
    null,
  );
});

test("a shrink (retention pruning ran) never breaches", () => {
  assert.equal(
    evaluateStorageGrowth({ currentBytes: 800_000, currentAt: NOW, previousBytes: 1_000_000, previousAt: WEEK_AGO }),
    null,
  );
});

test("modest weekly growth stays green", () => {
  assert.equal(
    evaluateStorageGrowth({ currentBytes: 1_200_000, currentAt: NOW, previousBytes: 1_000_000, previousAt: WEEK_AGO }),
    null,
  );
});

test("> 25%/week is a warn", () => {
  const breach = evaluateStorageGrowth({
    currentBytes: 1_300_000,
    currentAt: NOW,
    previousBytes: 1_000_000,
    previousAt: WEEK_AGO,
  });
  assert.equal(breach?.severity, "warn");
  assert.match(breach.observed, /\+30\.0%\/week/);
});

test("> 100%/week is a page", () => {
  const breach = evaluateStorageGrowth({
    currentBytes: 2_500_000,
    currentAt: NOW,
    previousBytes: 1_000_000,
    previousAt: WEEK_AGO,
  });
  assert.equal(breach?.severity, "page");
});

test("growth is normalised to a weekly rate over the real elapsed time", () => {
  // +30% but over 14 days ≈ 15%/week — under the warn line.
  assert.equal(
    evaluateStorageGrowth({
      currentBytes: 1_300_000,
      currentAt: NOW,
      previousBytes: 1_000_000,
      previousAt: "2026-08-25T06:00:00Z",
    }),
    null,
  );

  // The same +30% over 3 days ≈ 70%/week — a warn.
  assert.equal(
    evaluateStorageGrowth({
      currentBytes: 1_300_000,
      currentAt: NOW,
      previousBytes: 1_000_000,
      previousAt: "2026-09-05T06:00:00Z",
    })?.severity,
    "warn",
  );
});

test("captures closer than a day apart are too short a baseline to judge", () => {
  assert.equal(
    evaluateStorageGrowth({
      currentBytes: 5_000_000,
      currentAt: NOW,
      previousBytes: 1_000_000,
      previousAt: "2026-09-08T00:00:00Z",
    }),
    null,
  );
});
