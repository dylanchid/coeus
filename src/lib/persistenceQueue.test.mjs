import assert from "node:assert/strict";
import test from "node:test";
import { PersistenceQueue } from "./persistenceQueue.ts";

test("persistence failures are reported and the latest value can be retried", async () => {
  const states = [];
  const saved = [];
  let fail = true;
  const queue = new PersistenceQueue(
    async (value) => {
      if (fail) throw new Error("quota");
      saved.push(value);
    },
    (state) => states.push(state),
    "Not saved"
  );

  assert.equal(await queue.enqueue("draft"), false);
  assert.deepEqual(states.at(-1), { status: "error", message: "Not saved" });
  fail = false;
  assert.equal(await queue.retry(), true);
  assert.deepEqual(saved, ["draft"]);
  assert.deepEqual(states.at(-1), { status: "saved" });
});

test("synchronous updates coalesce before persistence begins", async () => {
  const states = [];
  const saved = [];
  const queue = new PersistenceQueue(
    async (value) => { saved.push(value); },
    (state) => states.push(state),
    "Not saved"
  );

  const first = queue.enqueue(1);
  const second = queue.enqueue(2);
  const third = queue.enqueue(3);
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(saved, [3]);
  assert.equal(states.filter(({ status }) => status === "saved").length, 1);
});

test("updates arriving during a save replace the pending archive snapshot", async () => {
  const saved = [];
  let releaseFirst;
  const firstStarted = Promise.withResolvers();
  const queue = new PersistenceQueue(
    async (value) => {
      saved.push(value);
      if (value === 1) {
        firstStarted.resolve();
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
    },
    () => undefined,
    "Not saved"
  );

  const first = queue.enqueue(1);
  await firstStarted.promise;
  const second = queue.enqueue(2);
  const third = queue.enqueue(3);
  releaseFirst();

  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(saved, [1, 3]);
});
