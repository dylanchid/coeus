import assert from "node:assert/strict";
import test from "node:test";

import { FixedWindowBudget } from "./fixedWindowBudget.ts";

test("fixed window budget bounds expensive work per client", () => {
  const budget = new FixedWindowBudget(10, 1_000);
  assert.deepEqual(budget.consume("one", 6, 100), {
    allowed: true,
    remaining: 4,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(budget.consume("one", 5, 200), {
    allowed: false,
    remaining: 4,
    retryAfterSeconds: 1,
  });
  assert.equal(budget.consume("two", 10, 200).allowed, true);
  assert.equal(budget.consume("one", 10, 1_100).allowed, true);
});
