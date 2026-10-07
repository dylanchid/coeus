import assert from "node:assert/strict";
import test from "node:test";

import { parseRatingWrite, summarizeRatings } from "./sourceRatings.ts";
import { handleGetSourceRatings, handlePutSourceRating } from "./sourceRatingsApi.ts";

test("summarizeRatings buckets half stars and averages in stars", () => {
  const summary = summarizeRatings([{ halfSteps: 10, ratings: 2 }, { halfSteps: 7, ratings: 1 }, { halfSteps: 99, ratings: 5 }]);
  assert.equal(summary.count, 3);
  assert.equal(summary.histogram[9], 2);
  assert.equal(summary.histogram[6], 1);
  assert.equal(summary.average, (10 + 10 + 7) / 3 / 2);
  assert.equal(summarizeRatings([]).average, null);
});

test("parseRatingWrite accepts half steps and 0 only for catalog sources", () => {
  assert.deepEqual(parseRatingWrite({ sourceId: "hn", rating: 3.5 }), { ok: true, value: { sourceId: "hn", halfSteps: 7 } });
  assert.equal(parseRatingWrite({ sourceId: "hn", rating: 0 }).ok, true);
  assert.equal(parseRatingWrite({ sourceId: "hn", rating: 3.3 }).ok, false);
  assert.equal(parseRatingWrite({ sourceId: "hn", rating: 6 }).ok, false);
  assert.equal(parseRatingWrite({ sourceId: "nope", rating: 3 }).ok, false);
});

function store() {
  const rows = new Map();
  return {
    rows,
    async summary(sourceId) {
      return summarizeRatings([...rows].filter(([key]) => key.endsWith(`:${sourceId}`)).map(([, halfSteps]) => ({ halfSteps, ratings: 1 })));
    },
    async mine(userId, sourceId) { return (rows.get(`${userId}:${sourceId}`) ?? 0) / 2; },
    async set(userId, sourceId, halfSteps) {
      if (halfSteps === 0) rows.delete(`${userId}:${sourceId}`);
      else rows.set(`${userId}:${sourceId}`, halfSteps);
    },
  };
}

test("PUT requires auth, stores the rating, and GET reflects it for the caller", async () => {
  const s = store();
  const put = (userId, body) => handlePutSourceRating(
    new Request("http://localhost/api/sources/ratings", { method: "PUT", body: JSON.stringify(body) }),
    { authenticate: async () => userId, store: s }
  );
  assert.equal((await put(null, { sourceId: "hn", rating: 4 })).status, 401);
  const saved = await put("u1", { sourceId: "hn", rating: 4.5 });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).count, 1);

  const anonymous = await handleGetSourceRatings(new Request("http://localhost/api/sources/ratings?id=hn"), { authenticate: async () => null, store: s });
  const anonymousBody = await anonymous.json();
  assert.equal(anonymousBody.mine, null);
  assert.equal(anonymousBody.average, 4.5);

  const mine = await handleGetSourceRatings(new Request("http://localhost/api/sources/ratings?id=hn"), { authenticate: async () => "u1", store: s });
  assert.equal((await mine.json()).mine, 4.5);

  await put("u1", { sourceId: "hn", rating: 0 });
  assert.equal(s.rows.size, 0);
  assert.equal((await handleGetSourceRatings(new Request("http://localhost/api/sources/ratings?id=zzz"), { authenticate: async () => null, store: s })).status, 400);
});
