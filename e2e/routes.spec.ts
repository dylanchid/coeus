import { expect, test } from "./support/fixtures";

/**
 * Route-handler wiring, exercised through the real Next server (av6). The
 * per-operation logic lives in tested `*Api.ts` handlers; what only a running
 * server covers is the wrapper itself — method exports, `context.params`
 * resolution, `dynamic = "force-dynamic"` cache headers, the `authenticate`
 * seam, and Next's own body/method handling.
 */

test.describe("unauthenticated wiring", () => {
  test("an auth-gated route rejects a request with no session as 401, not 500", async ({ request }) => {
    const response = await request.patch("/api/replies/00000000-0000-0000-0000-000000000000", {
      data: { body: "hello" },
    });
    expect(response.status()).toBe(401);
    // The wrapper pins private/no-store on every response, success or failure.
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("a method with no export returns 405", async ({ request }) => {
    const response = await request.get("/api/replies/00000000-0000-0000-0000-000000000000");
    expect(response.status()).toBe(405);
  });

  test("GET-only routes reject other verbs", async ({ request }) => {
    expect((await request.delete("/api/feeds")).status()).toBe(405);
  });
});

test.describe("force-dynamic cache headers", () => {
  test("health is served no-store", async ({ request }) => {
    const response = await request.get("/api/health");
    expect([200, 503]).toContain(response.status());
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

  test("HEAD /api/health is a 200 liveness probe", async ({ request }) => {
    expect((await request.head("/api/health")).status()).toBe(200);
  });

  test("a bad body still comes back no-store from a force-dynamic route", async ({ request }) => {
    const response = await request.post("/api/sources/preview", {
      headers: { "content-type": "application/json" },
      data: "{ not json",
    });
    expect(response.status()).toBe(400);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("authenticated wiring", () => {
  test("context.params reaches the handler: editing an unknown replyId is a 404, not a 500", async ({
    establishedUserPage: page,
  }) => {
    const response = await page.request.patch("/api/replies/11111111-1111-1111-1111-111111111111", {
      data: { body: "an edit to a reply that does not exist" },
    });
    expect(response.status()).toBe(404);
    expect((await response.json()).error).toMatch(/not found/i);
  });

  test("Next's JSON parsing surfaces as a 400 through the wrapper", async ({ establishedUserPage: page }) => {
    const response = await page.request.patch("/api/replies/11111111-1111-1111-1111-111111111111", {
      headers: { "content-type": "application/json" },
      data: "{ broken",
    });
    expect(response.status()).toBe(400);
  });
});

test("a public JSON route responds without a session", async ({ request }) => {
  const response = await request.get("/api/collections/discover");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
});
