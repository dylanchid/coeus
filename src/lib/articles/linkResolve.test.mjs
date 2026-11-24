import assert from "node:assert/strict";
import test from "node:test";

import { createLinkResolvePostHandler, LINK_RESOLVE_MAX_URLS } from "./linkResolve.ts";

function handler(options = {}) {
  let budgetCalls = 0;
  let resolveCalls = 0;
  const resolveCard = async (url) => {
    resolveCalls += 1;
    if (options.fail?.has(url)) return { decision: { allowed: false } };
    if (options.blockResolve) return { decision: { allowed: false } };
    return {
      decision: { allowed: true },
      card: { title: `Title for ${url}`, description: "Excerpt", siteName: "Example", domain: "example.com" },
    };
  };
  const POST = createLinkResolvePostHandler({
    resolveCard,
    isUrlAllowed: async (url) => !options.blocked?.has(url),
    consumeBudget: (_request, count) => {
      budgetCalls += 1;
      assert.equal(count, options.expectedBudgetCount ?? count);
      return options.budget ?? { allowed: true, remaining: 40, retryAfterSeconds: 0 };
    },
  });
  return { POST, getBudgetCalls: () => budgetCalls, getResolveCalls: () => resolveCalls };
}

test("link resolve rejects more than fifty URLs with 400", async () => {
  const { POST, getBudgetCalls, getResolveCalls } = handler();
  const urls = Array.from({ length: LINK_RESOLVE_MAX_URLS + 1 }, (_, index) => `https://example.com/${index}`);
  const response = await POST(
    new Request("http://test/api/archive/resolve-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(getBudgetCalls(), 0);
  assert.equal(getResolveCalls(), 0);
});

test("link resolve charges the refresh budget once for the whole batch", async () => {
  const urls = ["https://a.test/1", "https://a.test/2"];
  const { POST, getBudgetCalls } = handler({ expectedBudgetCount: 2 });
  const response = await POST(
    new Request("http://test/api/archive/resolve-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(getBudgetCalls(), 1);
  const rows = await response.json();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ok, true);
});

test("link resolve maps failures and SSRF blocks to ok false without throwing", async () => {
  const { POST, getResolveCalls } = handler({ blocked: new Set(["https://127.0.0.1/secret"]) });
  const response = await POST(
    new Request("http://test/api/archive/resolve-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["https://127.0.0.1/secret", "https://news.example/ok"] }),
    }),
  );
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows[0].ok, false);
  assert.equal(rows[1].ok, true);
  assert.equal(getResolveCalls(), 1);
});

test("link resolve returns 429 when the budget is spent", async () => {
  const { POST, getResolveCalls } = handler({
    budget: { allowed: false, remaining: 0, retryAfterSeconds: 12 },
    expectedBudgetCount: 1,
  });
  const response = await POST(
    new Request("http://test/api/archive/resolve-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: ["https://example.com/x"] }),
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(getResolveCalls(), 0);
});