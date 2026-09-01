import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchFeedBatch,
  mergeSourceFeed,
  runFeedQuery,
  visibleSourceIds,
} from "./feedQuery.ts";

function source(id, marker = "stale") {
  return {
    id,
    name: id.toUpperCase(),
    topic: "tech",
    articles: [{
      id: `${id}-${marker}`,
      sourceId: id,
      title: marker,
      url: `https://example.com/${id}`,
      summary: "",
      author: "",
      publishedAt: null,
      ageLabel: "now",
    }],
  };
}

function response(ids, marker = "fresh") {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        sources: ids.map((id) => source(id, marker)),
        updatedAt: "2026-08-05T12:00:00.000Z",
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("cached sources remain in every progressive refresh snapshot", async () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const requests = [];
  const progress = [];
  const fetcher = (url) => {
    const pending = deferred();
    requests.push({ url: String(url), pending });
    return pending.promise;
  };

  const resultPromise = runFeedQuery(
    { ids, order: ids, limit: 10, hours: 24 },
    {
      force: false,
      signal: new AbortController().signal,
      initialSources: ids.map((id) => source(id)),
      fetcher,
      onProgress: (snapshot) => progress.push(snapshot),
    }
  );

  await Promise.resolve();
  assert.equal(requests.length, 2);
  requests[0].pending.resolve(response(["a", "b", "c", "d", "e", "f"]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(progress[0].sources.length, 7);
  assert.equal(progress[0].sources.find((item) => item.id === "g").articles[0].title, "stale");

  requests[1].pending.resolve(response(["g"]));
  const result = await resultPromise;
  assert.equal(result.sources.length, 7);
  assert.ok(result.sources.every((item) => item.articles[0].title === "fresh"));
});

test("a rejected batch does not prevent unrelated batches from loading", async () => {
  const ids = ["a", "b", "c", "d"];
  const result = await runFeedQuery(
    { ids, order: ids, limit: 10, hours: 24 },
    {
      force: false,
      signal: new AbortController().signal,
      batchSize: 2,
      fetcher: async (url) => {
        const requested = new URL(String(url), "https://bareaga.test").searchParams.get("ids").split(",");
        return requested.includes("a")
          ? { ok: false, status: 503, async json() { return {}; } }
          : response(requested);
      },
    }
  );

  assert.equal(result.successfulBatches, 1);
  assert.deepEqual(result.failedIds, ["a", "b"]);
  assert.equal(result.sources.find((item) => item.id === "c").articles[0].title, "fresh");
  assert.match(result.sources.find((item) => item.id === "a").error, /503/);
});

test("batch concurrency is bounded", async () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const pending = [];
  let active = 0;
  let maximum = 0;
  const query = runFeedQuery(
    { ids, order: ids, limit: 10, hours: 24 },
    {
      force: false,
      signal: new AbortController().signal,
      batchSize: 2,
      concurrency: 2,
      fetcher: (url) => {
        active += 1;
        maximum = Math.max(maximum, active);
        const gate = deferred();
        const requested = new URL(String(url), "https://bareaga.test").searchParams.get("ids").split(",");
        pending.push(() => {
          active -= 1;
          gate.resolve(response(requested));
        });
        return gate.promise;
      },
    }
  );

  await Promise.resolve();
  assert.equal(active, 2);
  pending.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  while (pending.length) {
    pending.shift()();
    await new Promise((resolve) => setImmediate(resolve));
  }
  await query;
  assert.equal(maximum, 2);
});

test("cancellation stops progress from an obsolete topic request", async () => {
  const controller = new AbortController();
  let progressCalls = 0;
  const query = runFeedQuery(
    { ids: ["hn"], order: ["hn"], limit: 10, hours: 24 },
    {
      force: false,
      signal: controller.signal,
      fetcher: (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
      onProgress: () => { progressCalls += 1; },
    }
  );
  controller.abort();
  await assert.rejects(query, (error) => error.name === "AbortError");
  assert.equal(progressCalls, 0);
});

test("topic selection filters ids before a changed query starts", () => {
  const order = ["hn", "bbc", "cnbc", "nasa"];
  assert.deepEqual(visibleSourceIds(order, new Set(), "tech"), ["hn"]);
  assert.deepEqual(visibleSourceIds(order, new Set(), "science"), ["nasa"]);
  assert.deepEqual(visibleSourceIds(order, new Set(["bbc"]), "all"), ["hn", "cnbc", "nasa"]);
});

test("single-source retry and force refresh use the protected refresh request shape", async () => {
  let captured;
  await fetchFeedBatch(
    ["hn"],
    { limit: 7, hours: 12 },
    {
      force: true,
      signal: new AbortController().signal,
      fetcher: async (url, init) => {
        captured = { url: String(url), init };
        return response(["hn"]);
      },
    }
  );
  const url = new URL(captured.url, "https://bareaga.test");
  assert.equal(url.searchParams.get("ids"), "hn");
  assert.equal(url.searchParams.get("refresh"), "1");
  assert.equal(captured.init.cache, "no-store");
});

test("a successful retry replaces only the requested failed source", () => {
  const failed = { ...source("a"), articles: [], error: "Feed API 503" };
  const retried = source("a", "retried");
  const untouched = source("b", "existing");
  const merged = mergeSourceFeed([failed, untouched], retried, ["b", "a"]);

  assert.deepEqual(merged.map((item) => item.id), ["b", "a"]);
  assert.equal(merged[0].articles[0].title, "existing");
  assert.equal(merged[1].articles[0].title, "retried");
  assert.equal(merged[1].error, undefined);
});
